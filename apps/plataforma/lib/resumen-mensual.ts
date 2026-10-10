import { prisma } from './db'
import { tgAviso } from '@/lib/telegram'
import { getResumenFinanciero } from './finanzas'
import { getPLMensual } from './sivra/pl-mensual'
import { eur } from './dinero'
import {
  agruparPorDestino, cargosSinFactura, claveMovimiento, claveProveedor, detectarSuscripciones,
  formatearCierre, formatearSuscripciones, ultimosMeses,
  type CargoBanco, type FacturaDoc, type ItemGasto, type MovCierre,
} from './cierre-negocios'

// 📤 Cierre de mes narrado → Telegram (cron día 1). Por cada cuenta, recompone el resumen del MES
// ANTERIOR (mismas cifras que /banca — nunca inventa) + el P&L por piso, y manda un mensaje con el
// cierre. La narración de 1-2 frases es de la IA GRATIS y DEGRADA (si falla, van solo las cifras).
// Single-tenant en la práctica (la cuenta de Alberto), pero itera cuentas como contable-proactivo.

function mesAnterior(hoy: Date): { year: number; mes: string; desde: string; hasta: string; label: string } {
  const y = hoy.getFullYear(), m = hoy.getMonth() // 0-11
  const prev = new Date(y, m - 1, 1)               // primer día del mes anterior
  const py = prev.getFullYear(), pm = prev.getMonth()
  const mm = String(pm + 1).padStart(2, '0')
  const lastDay = new Date(py, pm + 1, 0).getDate()
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return { year: py, mes: `${py}-${mm}`, desde: `${py}-${mm}-01`, hasta: `${py}-${mm}-${lastDay}`, label: `${MESES[pm]} ${py}` }
}

async function narrar(datos: string): Promise<string> {
  try {
    const { aiComplete } = await import('./ai-client')
    const txt = await aiComplete([
      { role: 'system', content: 'Eres el analista financiero de Alberto (persona física, España). Recibes las CIFRAS ya calculadas del cierre de un mes. Escribe 1-2 frases en español, cercanas y accionables, resumiendo cómo fue el mes. NO inventes ni recalcules cifras. Sin markdown.' },
      { role: 'user', content: datos },
    ], { timeoutMs: 15_000 })
    return (txt || '').trim()
  } catch { return '' }
}

async function resumenDeCuenta(cuentaId: string, per: ReturnType<typeof mesAnterior>): Promise<string | null> {
  const resumen = await getResumenFinanciero(cuentaId, per.year, 0, per.desde, per.hasta).catch(() => null)
  if (!resumen) return null

  const ingresosNeg = resumen.correduria.cobradoNeto + resumen.pisos.total.ingresos
  const gastoNeg = resumen.correduria.gastosDeducibles + resumen.pisos.total.gastos
  const gastoPersonal = resumen.personal.total
  const gastoTotal = gastoNeg + gastoPersonal
  const resultado = ingresosNeg - gastoTotal
  const ant = resumen.anterior
  const deltaGasto = ant && ant.gastos > 0 ? Math.round(((gastoTotal - ant.gastos) / ant.gastos) * 100) : null

  const pl = await getPLMensual(per.mes).catch(() => null)
  const pisosOrden = pl?.pisos.slice().sort((a, b) => b.margen - a.margen) ?? []
  const lider = pisosOrden[0]
  const rezagado = pisosOrden.length > 1 ? pisosOrden[pisosOrden.length - 1] : null

  const narracion = await narrar([
    `Cierre de ${per.label}:`,
    `Ingresos negocio ${eur(ingresosNeg)}, gasto total ${eur(gastoTotal)} (negocio ${eur(gastoNeg)}, personal ${eur(gastoPersonal)}), resultado ${eur(resultado)}.`,
    deltaGasto !== null ? `Gasto vs mismo mes del año anterior: ${deltaGasto >= 0 ? '+' : ''}${deltaGasto}%.` : '',
    lider ? `Piso líder ${lider.nombre} (${lider.margen.toFixed(0)}% margen)${rezagado ? `, arrastra ${rezagado.nombre} (${rezagado.margen.toFixed(0)}%)` : ''}.` : '',
    `Tramo IRPF marginal estimado ${(resumen.fiscal.tramoActual.tipo * 100).toFixed(0)}%.`,
  ].filter(Boolean).join('\n'))

  const lineas = [
    `📤 *Cierre de ${per.label}*`,
    '',
    `💶 Ingresos negocio:  ${eur(ingresosNeg)}`,
    `🧾 Gasto total:       ${eur(gastoTotal)}${deltaGasto !== null ? ` (${deltaGasto >= 0 ? '+' : ''}${deltaGasto}% vs año ant.)` : ''}`,
    `   · negocio ${eur(gastoNeg)} · personal ${eur(gastoPersonal)}`,
    `${resultado >= 0 ? '🟢' : '🔴'} Resultado:         ${eur(resultado)}`,
  ]
  if (lider) {
    lineas.push('', `🏖️ Piso líder: ${lider.nombre} (${lider.margen.toFixed(0)}%)`)
    if (rezagado) lineas.push(`🐢 Arrastra: ${rezagado.nombre} (${rezagado.margen.toFixed(0)}%)`)
  }
  lineas.push('', `🏷️ Tramo IRPF marginal ~${(resumen.fiscal.tramoActual.tipo * 100).toFixed(0)}%`)
  if (narracion) lineas.push('', `🤖 ${narracion}`)

  return lineas.join('\n')
}

export async function enviarResumenMensual(): Promise<{ cuentas: number; enviados: number }> {
  const per = mesAnterior(new Date())
  const cuentas = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM cuentas`.catch(() => [])
  let enviados = 0
  for (const c of cuentas) {
    const msg = await resumenDeCuenta(c.id, per).catch(() => null)
    if (msg) { await tgAviso('finanzas.resumen-mensual', msg).catch(() => {}); enviados++ }
  }
  return { cuentas: cuentas.length, enviados }
}


// ── Cierre por negocio (día 5) + revisión de suscripciones ───────────────────────────────────────
// Dos mensajes más, además del narrado: `finanzas.cierre-negocios` y `finanzas.suscripciones`.
// Lógica pura y testeada en `cierre-negocios.ts`; aquí solo los SELECT (todos de lectura).
const VENTANA_SUSCRIPCIONES = 4

type MovRow = { id: string; fecha: string; importe: number; destino: string | null; conciliado: boolean | null; factura_ref: string | null; contraparte: string | null; concepto: string | null }

async function movimientosDelMes(cuentaId: string, desde: string, hasta: string): Promise<MovRow[]> {
  return prisma.$queryRaw<MovRow[]>`
    SELECT m.id::text AS id, m.fecha_operacion::text AS fecha, m.importe::float8 AS importe, m.destino,
           m.conciliado, m.factura_ref, m.contraparte, COALESCE(m.concepto_normalizado, m.concepto) AS concepto
    FROM v_movimientos_activos m
    JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND m.fecha_operacion >= ${desde}::date AND m.fecha_operacion <= ${hasta}::date`
}

// Facturas/gastos documentados (todo el histórico reciente: define «proveedores que suelen facturar»).
// `gastos` no tiene cuenta_id (tabla de sivra, single-tenant): se lee entera, igual que `conciliacion.ts`.
async function documentosProveedor(cuentaId: string, desde: string): Promise<(FacturaDoc & { nombre: string })[]> {
  const [fp, g] = await Promise.all([
    prisma.$queryRaw<{ proveedor: string | null; fecha: string; importe: number }[]>`
      SELECT proveedor, fecha_factura::text AS fecha, importe::float8 AS importe FROM facturas_proveedor
      WHERE cuenta_id = ${cuentaId}::uuid AND estado <> 'rechazada' AND fecha_factura >= ${desde}::date`,
    prisma.$queryRaw<{ proveedor: string | null; fecha: string; importe: number }[]>`
      SELECT proveedor, fecha::text AS fecha, total::float8 AS importe FROM gastos WHERE fecha >= ${desde}::date`,
  ])
  return [...fp, ...g].map(r => ({ clave: claveProveedor(r.proveedor), nombre: r.proveedor ?? '', fecha: r.fecha, importe: Math.abs(Number(r.importe)) }))
}

async function cierrePorNegocio(cuentaId: string, per: ReturnType<typeof mesAnterior>): Promise<string> {
  const desdeDocs = `${per.year - 1}-01-01`
  const [movs, docs, iva, pyc] = await Promise.all([
    movimientosDelMes(cuentaId, per.desde, per.hasta),
    documentosProveedor(cuentaId, desdeDocs),
    prisma.$queryRaw<{ iva: number | null; sin_iva: number }[]>`
      SELECT SUM(cuota_iva)::float8 AS iva, COUNT(*) FILTER (WHERE cuota_iva IS NULL)::int AS sin_iva
      FROM facturas_proveedor
      WHERE cuenta_id = ${cuentaId}::uuid AND estado <> 'rechazada'
        AND fecha_factura >= ${per.desde}::date AND fecha_factura <= ${per.hasta}::date`,
    prisma.$queryRaw<{ n: number; gastos: number; ingresos: number }[]>`
      SELECT COUNT(m.id)::int AS n,
             COALESCE(SUM(-m.importe) FILTER (WHERE m.importe < 0), 0)::float8 AS gastos,
             COALESCE(SUM(m.importe) FILTER (WHERE m.importe > 0), 0)::float8 AS ingresos
      FROM v_movimientos_activos m
      JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
      JOIN sociedades s ON s.id = cb.sociedad_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND s.nombre ILIKE 'punto y coma%'
        AND m.fecha_operacion >= ${per.desde}::date AND m.fecha_operacion <= ${per.hasta}::date`,
  ])
  const movsCierre: MovCierre[] = movs.map(m => ({ importe: Number(m.importe), destino: m.destino, conciliado: m.conciliado, facturaRef: m.factura_ref }))
  const cargos: CargoBanco[] = movs.filter(m => Number(m.importe) < 0).map(m => ({
    id: m.id, fecha: m.fecha, importe: Number(m.importe), destino: m.destino,
    clave: claveMovimiento(m.contraparte, m.concepto), nombre: m.contraparte ?? m.concepto ?? '—',
    conciliado: m.conciliado, facturaRef: m.factura_ref,
  }))
  const p = pyc[0]
  return formatearCierre({
    label: per.label,
    filas: agruparPorDestino(movsCierre),
    ivaSoportado: iva[0]?.iva ?? null,
    facturasSinIva: Number(iva[0]?.sin_iva ?? 0),
    sinFactura: cargosSinFactura(cargos, docs),
    puntoYComa: p && Number(p.n) > 0 ? { movimientos: Number(p.n), gastos: Number(p.gastos), ingresos: Number(p.ingresos) } : null,
  })
}

async function suscripciones(cuentaId: string, per: ReturnType<typeof mesAnterior>): Promise<string | null> {
  const meses = ultimosMeses(per.mes, VENTANA_SUSCRIPCIONES)
  const desde = `${meses[0]}-01`
  const [movs, docs] = await Promise.all([
    movimientosDelMes(cuentaId, desde, per.hasta),
    documentosProveedor(cuentaId, desde),
  ])
  const items: ItemGasto[] = [
    ...movs.filter(m => Number(m.importe) < 0 && m.destino !== 'traspaso_interno').map(m => ({
      clave: claveMovimiento(m.contraparte, m.concepto), nombre: m.contraparte ?? m.concepto ?? '',
      mes: m.fecha.slice(0, 7), importe: -Number(m.importe), fuente: 'banco' as const,
    })),
    ...docs.map(d => ({ clave: d.clave, nombre: d.nombre, mes: d.fecha.slice(0, 7), importe: d.importe, fuente: 'factura' as const })),
  ]
  return formatearSuscripciones(detectarSuscripciones(items, meses), VENTANA_SUSCRIPCIONES)
}

export async function enviarCierreNegocios(): Promise<{ cuentas: number; cierres: number; suscripciones: number }> {
  const per = mesAnterior(new Date())
  const cuentas = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM cuentas`.catch(() => [])
  let cierres = 0, subs = 0
  for (const c of cuentas) {
    const cierre = await cierrePorNegocio(c.id, per).catch(() => null)
    if (cierre) { await tgAviso('finanzas.cierre-negocios', cierre).catch(() => {}); cierres++ }
    const s = await suscripciones(c.id, per).catch(() => null)
    if (s) { await tgAviso('finanzas.suscripciones', s).catch(() => {}); subs++ }
  }
  return { cuentas: cuentas.length, cierres, suscripciones: subs }
}
