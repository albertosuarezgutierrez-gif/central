// apps/plataforma/lib/contable/respuestas-directas.ts
// Responde por SQL las intenciones detectadas por intencion.ts, SIN LLM. Todo scoped por cuenta_id
// (multi-tenant) y excluyendo duplicados (`duplicado_estado <> 'ignorado'`, el landmine del doble
// conteo). OJO: la columna de fecha es `fecha_operacion`, NO `fecha`. Devuelve el texto ya listo,
// o null si NO puede responder con confianza (→ el cerebro cae al LLM).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getResumenFinanciero } from '@/lib/finanzas'
import { NOMBRE_MES, type Intencion } from './intencion'

const eur = (n: number) => `${n.toFixed(2)} €`
// Euros enteros con separador de miles (12450 → "12.450 €"), sin depender de toLocaleString/ICU.
const e0 = (n: number) => `${Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`

const DESTINO_LABEL: Record<string, string> = {
  turistico_pisos: 'Pisos turísticos', turistico_duplex: 'Dúplex/Villasís',
  seguros: 'Correduría (seguros)', personal: 'Personal', traspaso_interno: 'Traspaso interno',
}

// Suma de movimientos (gasto = importe<0, ingreso = importe>0) con condiciones extra opcionales.
async function suma(
  cuentaId: string, signo: 'gasto' | 'ingreso', extra: Prisma.Sql,
): Promise<{ total: number; n: number } | null> {
  const cond = signo === 'gasto' ? Prisma.sql`mb.importe < 0` : Prisma.sql`mb.importe > 0`
  const rows = await prisma.$queryRaw<{ total: number; n: bigint }[]>(Prisma.sql`
    SELECT coalesce(sum(abs(mb.importe)), 0)::float8 AS total, count(*)::bigint AS n
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
      AND ${cond}
      ${extra}`).catch(() => null)
  if (!rows) return null
  return { total: Number(rows[0]?.total || 0), n: Number(rows[0]?.n || 0) }
}

export async function responderDirecto(cuentaId: string, intn: Intencion): Promise<string | null> {
  const palabra = (s: 'gasto' | 'ingreso') => (s === 'gasto' ? 'gastado' : 'ingresado')

  if (intn.tipo === 'movimientos_mes') {
    const r = await suma(cuentaId, intn.signo, Prisma.sql`
      AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}
      AND EXTRACT(month FROM mb.fecha_operacion) = ${intn.mes}`)
    if (!r) return null
    const per = `${NOMBRE_MES[intn.mes]} de ${intn.anio}`
    return r.n === 0
      ? `No veo ${intn.signo === 'gasto' ? 'gastos' : 'ingresos'} en ${per}.`
      : `En ${per} llevas ${eur(r.total)} ${palabra(intn.signo)} (${r.n} movimiento${r.n === 1 ? '' : 's'}).`
  }

  if (intn.tipo === 'movimientos_anio') {
    const r = await suma(cuentaId, intn.signo, Prisma.sql`AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}`)
    if (!r) return null
    return r.n === 0
      ? `No veo ${intn.signo === 'gasto' ? 'gastos' : 'ingresos'} en ${intn.anio}.`
      : `En ${intn.anio} llevas ${eur(r.total)} ${palabra(intn.signo)} (${r.n} movimiento${r.n === 1 ? '' : 's'}).`
  }

  if (intn.tipo === 'concepto') {
    const likes = intn.terminos.map(term =>
      Prisma.sql`(coalesce(mb.concepto_normalizado,'') || ' ' || coalesce(mb.concepto,'') || ' ' || coalesce(mb.contraparte,'')) ILIKE ${'%' + term + '%'}`)
    const r = await suma(cuentaId, intn.signo, Prisma.sql`
      AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}
      AND (${Prisma.join(likes, ' OR ')})`)
    if (!r) return null
    return r.n === 0
      ? `No encuentro cargos de ${intn.etiqueta} en ${intn.anio}. (Puede que estén con otro nombre — dímelo y lo afino.)`
      : `En ${intn.etiqueta} llevas ${eur(r.total)} ${palabra(intn.signo)} en ${intn.anio} (${r.n} cargo${r.n === 1 ? '' : 's'}).`
  }

  if (intn.tipo === 'por_destino') {
    const rows = await prisma.$queryRaw<{ destino: string; gastos: number; ingresos: number }[]>(Prisma.sql`
      SELECT coalesce(mb.destino, 'personal') AS destino,
             sum(CASE WHEN mb.importe < 0 THEN -mb.importe ELSE 0 END)::float8 AS gastos,
             sum(CASE WHEN mb.importe > 0 THEN  mb.importe ELSE 0 END)::float8 AS ingresos
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
        AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}
      GROUP BY 1 ORDER BY 2 DESC`).catch(() => null)
    if (!rows) return null
    if (!rows.length) return `No veo movimientos en ${intn.anio}.`
    const lineas = rows.map(x => `• ${DESTINO_LABEL[x.destino] || x.destino}: ${eur(x.gastos)} gasto · ${eur(x.ingresos)} ingreso`)
    return `Desglose ${intn.anio} por destino:\n${lineas.join('\n')}`
  }

  if (intn.tipo === 'facturas_pendientes') {
    const rows = await prisma.$queryRaw<{ proveedor: string; importe: number; estado: string }[]>(Prisma.sql`
      SELECT proveedor, importe::float8 AS importe, estado
      FROM facturas_proveedor
      WHERE cuenta_id = ${cuentaId}::uuid AND estado NOT IN ('pagada', 'rechazada')
      ORDER BY fecha_factura DESC NULLS LAST LIMIT 15`).catch(() => null)
    if (!rows) return null
    if (!rows.length) return 'No tienes facturas de proveedor pendientes 🎉'
    const total = rows.reduce((s, x) => s + Math.abs(Number(x.importe) || 0), 0)
    const lineas = rows.map(x => `• ${x.proveedor} · ${eur(Math.abs(Number(x.importe) || 0))} · ${x.estado}`)
    return `Tienes ${rows.length} factura${rows.length === 1 ? '' : 's'} de proveedor sin cerrar (${eur(total)}):\n${lineas.join('\n')}`
  }

  if (intn.tipo === 'tramo_fiscal') {
    // Mismo cálculo que /finanzas (tramos IRPF sobre la base imponible estimada del año).
    const resumen = await getResumenFinanciero(cuentaId, intn.anio).catch(() => null)
    const f = resumen?.fiscal
    if (!f || !f.tramoActual) return null
    const pct = (x: number) => `${Math.round((x || 0) * 100)}%`
    const ta = f.tramoActual
    const rango = ta.hasta != null ? `de ${e0(ta.desde)} a ${e0(ta.hasta)}` : `a partir de ${e0(ta.desde)}`
    const margen = f.margenHastaProximoTramo != null
      ? ` Te faltan ${e0(f.margenHastaProximoTramo)} de base para saltar al siguiente tramo.`
      : ' Ya estás en el tramo más alto.'
    return `Ahora mismo tu tramo marginal de IRPF es el **${pct(ta.tipo)}** (${rango}), con una base imponible estimada de ${e0(f.baseImponibleEstimada)} para ${intn.anio} y un tipo medio efectivo del ${pct(f.tipoEfectivo)}.${margen}\n\n(Estimación con lo declarado en la app hasta hoy; el detalle está en 💶 Finanzas.)`
  }

  return null
}
