// apps/plataforma/lib/contable/extracto-tarjeta.ts
// Flujo del agente para un EXTRACTO DE TARJETA subido al chat (📎): parsea el PDF (cifras exactas,
// no inventadas), lo importa como cuenta tipo='tarjeta' (dedupe idempotente), categoriza, empareja
// las DEVOLUCIONES con su compra original (para que se anulen en el deducible), comprueba el CUADRE
// (Σ compras − Σ devoluciones = liquidación) y ARCHIVA el PDF en Drive. Las dudosas se preguntan por
// Telegram (enviarResumenTarjeta / mov_*). Reutiliza todo el motor de banca; no duplica lógica.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgSend, tgSendButtons, escapeHtml } from '@central/core-telegram'
import { importarExtracto, enviarResumenTarjeta } from '@/lib/banca'
import { analizarMovimientos } from '@/lib/categorizar'
import { comercioDe } from '@/lib/comercio'
import { eur } from '@/lib/dinero'
import { subir } from '@/lib/agente-facturas/drive'
import { parseTarjetaPdfTexto, cuadrarExtractoTarjeta, esPagoReciboTarjeta } from '@/lib/extracto-tarjeta-pdf'
import { casarDevolucion, type CompraCandidata } from '@/lib/devoluciones-tarjeta'
import { esCargoFinanciero, dobleCobro, subioPrecio } from '@/lib/vigilantes-tarjeta'

export type ResultadoExtractoTarjeta =
  | { ok: false; motivo: string }
  | { ok: true; tipo: 'extracto_tarjeta'; resumen: string; driveUrl?: string }

// Resuelve la sociedad + titular de una tarjeta por su ccc (TARJETA-KUTXA-<últ.4>), reutilizando
// la cuenta bancaria que YA existe (ambas tarjetas están dadas de alta con su titular). Fallback a
// la primera sociedad de la cuenta. ⚠️ NO se filtra `cuentas` por `estado` (columna inexistente).
async function resolverSociedadTitular(
  cuentaId: string, ccc: string,
): Promise<{ sociedadId: string; titular: 'titular' | 'conyuge' } | null> {
  const existentes = await prisma.$queryRaw<Array<{ sociedad_id: string; titular: string | null }>>(Prisma.sql`
    SELECT sociedad_id, titular FROM cuentas_bancarias
    WHERE cuenta_id = ${cuentaId}::uuid AND iban = ${ccc} LIMIT 1
  `).catch(() => [])
  if (existentes[0]?.sociedad_id) {
    return { sociedadId: existentes[0].sociedad_id, titular: existentes[0].titular === 'conyuge' ? 'conyuge' : 'titular' }
  }
  const soc = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM sociedades WHERE cuenta_id = ${cuentaId}::uuid LIMIT 1
  `).catch(() => [])
  return soc[0]?.id ? { sociedadId: soc[0].id, titular: 'titular' } : null
}

// Empareja las devoluciones (abonos que no son PAGO RECIBO) con su compra original y les copia el
// destino para que se ANULEN en el cómputo por destino. Las que no casan → requiere_revision y un
// mensaje Telegram con botones (mov_*) para que Alberto las asigne. Devuelve el recuento.
async function emparejarDevoluciones(
  cuentaBancariaIds: string[], desde: string, hasta: string,
): Promise<{ casadas: number; sinCasar: number }> {
  if (!cuentaBancariaIds.length) return { casadas: 0, sinCasar: 0 }
  const abonos = await prisma.$queryRaw<Array<{ id: string; importe: number; concepto: string | null; contraparte: string | null; fecha: string }>>(Prisma.sql`
    SELECT id, importe::float AS importe, concepto, contraparte, fecha_operacion::text AS fecha
    FROM movimientos_bancarios
    WHERE cuenta_bancaria_id = ANY(${cuentaBancariaIds}::uuid[])
      AND importe > 0
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      AND coalesce(duplicado_estado, '') <> 'ignorado'
  `).catch(() => [])
  const devoluciones = abonos.filter(a => !esPagoReciboTarjeta(a.concepto))
  if (!devoluciones.length) return { casadas: 0, sinCasar: 0 }

  // Compras candidatas: cargos de las mismas tarjetas hasta 120 días antes del rango importado.
  const compras = await prisma.$queryRaw<Array<{ id: string; importe: number; concepto: string | null; contraparte: string | null; fecha: string; destino: string | null; propiedad_id: string | null }>>(Prisma.sql`
    SELECT id, importe::float AS importe, concepto, contraparte, fecha_operacion::text AS fecha, destino, propiedad_id
    FROM movimientos_bancarios
    WHERE cuenta_bancaria_id = ANY(${cuentaBancariaIds}::uuid[])
      AND importe < 0
      AND fecha_operacion >= (${desde}::date - INTERVAL '120 days')
      AND coalesce(duplicado_estado, '') <> 'ignorado'
  `).catch(() => [])
  const candidatas: CompraCandidata[] = compras.map(c => ({
    id: c.id, importe: c.importe, comercio: comercioDe(c.contraparte, c.concepto),
    fecha: c.fecha, destino: c.destino, propiedadId: c.propiedad_id,
  }))

  let casadas = 0, sinCasar = 0
  for (const d of devoluciones) {
    const match = casarDevolucion(
      { importe: d.importe, comercio: comercioDe(d.contraparte, d.concepto), fecha: d.fecha },
      candidatas,
    )
    if (match) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios
        SET destino = ${match.destino}, propiedad_id = ${match.propiedadId},
            destino_confirmado = true, requiere_revision = false,
            comentario = COALESCE(comentario || ' | ', '') || 'devolución casada con la compra'
        WHERE id = ${d.id}::uuid
      `).catch(() => {})
      casadas++
    } else {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios
        SET requiere_revision = true,
            comentario = COALESCE(comentario || ' | ', '') || 'devolución sin compra casada'
        WHERE id = ${d.id}::uuid AND destino_confirmado IS NOT TRUE
      `).catch(() => {})
      // Las devoluciones son abonos (importe > 0) y getMovimientosDudosos solo mira cargos, así que
      // las sacamos aquí con sus propios botones (asignar destino la anula contra su compra futura).
      const comercio = comercioDe(d.contraparte, d.concepto).slice(0, 40).toUpperCase() || 'DEVOLUCIÓN'
      await tgSendButtons(
        `↩️ <b>Devolución</b> · ${escapeHtml(comercio)} · ${d.fecha.slice(0, 10)} · +${eur(d.importe)}\n¿De qué negocio era la compra devuelta?`,
        [[
          { texto: '✅ Pisos', callback: `mov_pisos:${d.id}` },
          { texto: '✅ Correduría', callback: `mov_correduria:${d.id}` },
        ], [
          { texto: '❌ Personal', callback: `mov_personal:${d.id}` },
          { texto: '⏭️ Saltar', callback: `mov_saltar:${d.id}` },
        ]],
      ).catch(() => {})
      sinCasar++
    }
  }
  return { casadas, sinCasar }
}

// ── VIGILANTES (Fase 2): solo AVISAN sobre las compras del extracto, no bloquean ────────────────
const VIG_UMBRAL_NUEVO = 80        // € — cargo de comercio nunca visto que merece confirmación
const VIG_UMBRAL_JUSTIFICANTE = 100 // € — compra deducible grande sin factura
const VIG_MAX_LISTA = 5

async function vigilantesTarjeta(
  cuentaId: string, ids: string[], desde: string, hasta: string,
): Promise<void> {
  if (!ids.length) return
  const compras = await prisma.$queryRaw<Array<{ id: string; importe: number; concepto: string | null; contraparte: string | null; destino: string | null; fecha: string }>>(Prisma.sql`
    SELECT id, importe::float AS importe, concepto, contraparte, destino, fecha_operacion::text AS fecha
    FROM movimientos_bancarios
    WHERE cuenta_bancaria_id = ANY(${ids}::uuid[]) AND importe < 0
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      AND coalesce(duplicado_estado, '') <> 'ignorado'
  `).catch(() => [])
  if (!compras.length) return
  const conComercio = compras.map(c => ({ ...c, comercio: comercioDe(c.contraparte, c.concepto) }))

  // 1) Intereses / comisiones de la tarjeta (coste financiero evitable).
  const totalFinanc = conComercio.filter(c => esCargoFinanciero(c.concepto)).reduce((s, c) => s + Math.abs(c.importe), 0)

  // 2) Posible cobro doble (mismo comercio + mismo importe repetido).
  const dobles = dobleCobro(conComercio.filter(c => !esCargoFinanciero(c.concepto)).map(c => ({ id: c.id, comercio: c.comercio, importe: c.importe })))

  // Histórico previo de estas tarjetas → "comercio nunca visto" y "subida de precio de recurrente".
  const previos = await prisma.$queryRaw<Array<{ importe: number; concepto: string | null; contraparte: string | null }>>(Prisma.sql`
    SELECT importe::float AS importe, concepto, contraparte
    FROM movimientos_bancarios
    WHERE cuenta_bancaria_id = ANY(${ids}::uuid[]) AND importe < 0
      AND fecha_operacion < ${desde}::date
      AND coalesce(duplicado_estado, '') <> 'ignorado'
    ORDER BY fecha_operacion DESC
    LIMIT 3000
  `).catch(() => [])
  const seen = new Set<string>()
  const ultImporte = new Map<string, number>()   // comercio → |importe| más reciente previo
  for (const p of previos) {
    const com = comercioDe(p.contraparte, p.concepto).toLowerCase()
    if (!com) continue
    seen.add(com)
    if (!ultImporte.has(com)) ultImporte.set(com, Math.abs(p.importe))  // ORDER BY DESC → el primero es el más reciente
  }

  // 3) Cargos no reconocidos (solo si hay histórico; en el primer import todo sería "nuevo").
  const nuevos = seen.size === 0 ? [] : conComercio
    .filter(c => !esCargoFinanciero(c.concepto) && Math.abs(c.importe) > VIG_UMBRAL_NUEVO && c.comercio && !seen.has(c.comercio.toLowerCase()))
    .sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe))
    .slice(0, VIG_MAX_LISTA)

  // 4) Subida de precio de un cargo recurrente (suscripción que sube).
  const subidas = conComercio
    .filter(c => c.comercio && ultImporte.has(c.comercio.toLowerCase()) && subioPrecio(c.importe, ultImporte.get(c.comercio.toLowerCase()) as number))
    .slice(0, VIG_MAX_LISTA)

  // 5) Justificantes pendientes de compras deducibles grandes (enlaza con el Check 8 trimestral).
  const just = await prisma.$queryRaw<Array<{ n: bigint; total: number }>>(Prisma.sql`
    SELECT count(*) AS n, coalesce(sum(abs(importe)), 0)::float AS total
    FROM movimientos_bancarios
    WHERE cuenta_bancaria_id = ANY(${ids}::uuid[]) AND importe < 0
      AND destino IN ('turistico_pisos', 'turistico_duplex', 'seguros')
      AND abs(importe) > ${VIG_UMBRAL_JUSTIFICANTE}
      AND conciliado = false AND factura_ref IS NULL
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      AND coalesce(duplicado_estado, '') <> 'ignorado'
  `).catch(() => [])
  const justN = Number(just[0]?.n ?? 0)
  const justTotal = Number(just[0]?.total ?? 0)

  // Un solo mensaje Telegram con las secciones que tengan contenido (evita spam).
  const bloques: string[] = []
  if (totalFinanc > 0) bloques.push(`💸 <b>Intereses/comisiones</b>: la tarjeta te cobró ${eur(totalFinanc)} este mes. Liquidando en el mes te lo ahorras.`)
  if (dobles.length) bloques.push(`🔁 <b>Posible cobro doble</b>:\n${dobles.slice(0, VIG_MAX_LISTA).map(d => `  · ${escapeHtml(d.comercio)}: ${d.ids.length}× ${eur(d.importe)}`).join('\n')}`)
  if (nuevos.length) bloques.push(`🆕 <b>Cargos que no reconozco</b> (comercio nuevo):\n${nuevos.map(c => `  · ${escapeHtml(c.comercio)}: ${eur(Math.abs(c.importe))} (${c.fecha})`).join('\n')}\n¿Los reconoces?`)
  if (subidas.length) bloques.push(`📈 <b>Subidas de precio</b>:\n${subidas.map(c => `  · ${escapeHtml(c.comercio)}: ${eur(ultImporte.get(c.comercio.toLowerCase()) as number)} → ${eur(Math.abs(c.importe))}`).join('\n')}`)
  if (justN > 0) bloques.push(`🧾 <b>Justificantes pendientes</b>: ${justN} compra(s) deducible(s) por ${eur(justTotal)} sin factura. Consíguelas para Hacienda (/finanzas?tab=gastos).`)

  if (bloques.length) await tgSend(`🔎 <b>Revisión de la tarjeta</b>\n\n${bloques.join('\n\n')}`).catch(() => {})
}

// Procesa un extracto de tarjeta subido al chat/Telegram. `texto` ya viene extraído del PDF.
export async function procesarExtractoTarjeta(
  cuentaId: string, buffer: Buffer, mimeType: string, fileName: string, texto: string,
): Promise<ResultadoExtractoTarjeta> {
  const extractos = parseTarjetaPdfTexto(texto)
  if (!extractos.length || !extractos[0].movimientos.length) {
    return { ok: false, motivo: 'Parece un extracto de tarjeta pero no pude leer los movimientos. ¿Es el PDF "Movimientos de tarjeta" de Kutxabank?' }
  }

  const st = await resolverSociedadTitular(cuentaId, extractos[0].ccc)
  if (!st) return { ok: false, motivo: 'No encuentro una sociedad donde dar de alta la tarjeta. Créala en /banca y reinténtalo.' }

  const res = await importarExtracto(cuentaId, st.sociedadId, extractos, 'pdf', st.titular, 'tarjeta')
  await analizarMovimientos(cuentaId).catch(() => ({ categorizados: 0 }))

  const desde = res.fechaInicio || extractos[0].fechaInicio || new Date().toISOString().slice(0, 10)
  const hasta = res.fechaFin || extractos[0].fechaFin || desde
  const dev = await emparejarDevoluciones(res.cuentaBancariaIds, desde, hasta).catch(() => ({ casadas: 0, sinCasar: 0 }))

  // Cuadre: la liquidación (PAGO RECIBO) debe igualar Σ compras − Σ devoluciones.
  let cuadraTodo = true
  let liquidacion: number | null = null
  let diferencia = 0
  for (const ex of extractos) {
    const c = cuadrarExtractoTarjeta(ex)
    if (c.liquidacion !== null) liquidacion = (liquidacion ?? 0) + c.liquidacion
    if (!c.cuadra) { cuadraTodo = false; diferencia += c.diferencia }
  }

  // Resumen por Telegram (deducible/no + dudosas por movimiento) del mes importado.
  const mes = desde.slice(0, 7)
  await enviarResumenTarjeta(cuentaId, res.cuentaBancariaIds, mes).catch(() => {})

  // Vigilantes (Fase 2): intereses, cobro doble, cargos nuevos, subidas de precio, justificantes.
  await vigilantesTarjeta(cuentaId, res.cuentaBancariaIds, desde, hasta).catch(() => {})

  // Archivar el PDF en Drive (año/mes), consultable como justificante.
  let driveUrl: string | undefined
  try {
    const d = await subir(buffer, fileName || `extracto-tarjeta-${mes}.pdf`, mimeType || 'application/pdf', hasta)
    driveUrl = d?.url
  } catch { /* no romper el import si Drive falla */ }

  const mascara = extractos[0].ccc.length >= 4 ? `****${extractos[0].ccc.slice(-4)}` : extractos[0].ccc
  const cuadreLinea = liquidacion === null
    ? ''
    : cuadraTodo
      ? `✅ Cuadra con la liquidación de ${eur(liquidacion)}.`
      : `⚠️ OJO: el desglose NO cuadra con la liquidación (faltan ${eur(diferencia)}). ¿Faltan páginas o es otro mes?`
  // Descuadre = probablemente faltan páginas / mes equivocado: avisa también al móvil (Telegram).
  if (liquidacion !== null && !cuadraTodo) {
    await tgSend(`💳 <b>Extracto ${escapeHtml(mascara)}: el desglose NO cuadra</b>\nFaltan ${eur(diferencia)} respecto a la liquidación. Revisa si el PDF está completo o es el mes correcto.`).catch(() => {})
  }
  const devLinea = dev.casadas || dev.sinCasar
    ? `↩️ Devoluciones: ${dev.casadas} emparejadas${dev.sinCasar ? `, ${dev.sinCasar} por confirmar en Telegram` : ''}.`
    : ''
  const driveLinea = driveUrl ? '📁 Archivado en Drive.' : '⚠️ No pude archivarlo en Drive (los movimientos sí están dentro).'

  const resumen = [
    `💳 Extracto de la tarjeta ${mascara} importado: ${res.insertados} movimientos nuevos${res.duplicados ? ` (${res.duplicados} ya estaban)` : ''}.`,
    cuadreLinea,
    devLinea,
    'Te mando por Telegram el desglose (deducible / no) y las dudosas para que confirmes.',
    driveLinea,
  ].filter(Boolean).join('\n')

  return { ok: true, tipo: 'extracto_tarjeta', resumen, driveUrl }
}
