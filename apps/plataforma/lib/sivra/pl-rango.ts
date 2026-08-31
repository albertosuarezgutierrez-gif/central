// lib/sivra/pl-rango.ts — P&L de los pisos por RANGO de meses + canales + cancelaciones (BD).
//
// Reutiliza `getPLMensual` mes a mes (es la ÚNICA fuente del P&L: caja del mes, reparto de
// lavandería, facturas de Sique Brilla) y agrega con `pl-rango-logica.ts`. No recalcula nada
// por otro camino — dos fórmulas del mismo número acaban divergiendo.
import { prisma } from '@/lib/db'
import { getPLMensual, type PLMensual, type PLPiso } from './pl-mensual'
import { agregarPisos, mesesDelRango, mesAniosAtras } from './pl-rango-logica'

const CONCURRENCIA = 3

/** Caché en memoria por mes (best-effort, por instancia serverless). Un mes CERRADO apenas
 *  cambia (solo si se reclasifica banca o se aporta una factura), el corriente sí. El caller
 *  que acaba de escribir (subir factura) pide `fresco` y se salta la caché. */
const cacheMes = new Map<string, { at: number; data: PLMensual }>()
const TTL_CERRADO_MS = 60 * 60 * 1000
const TTL_CORRIENTE_MS = 5 * 60 * 1000

function mesCorriente(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function getPLMensualCached(mes: string, opts?: { fresco?: boolean }): Promise<PLMensual> {
  const ttl = mes < mesCorriente() ? TTL_CERRADO_MS : TTL_CORRIENTE_MS
  const hit = cacheMes.get(mes)
  if (!opts?.fresco && hit && Date.now() - hit.at < ttl) return hit.data
  const data = await getPLMensual(mes)
  cacheMes.set(mes, { at: Date.now(), data })
  return data
}

async function enLotes<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const idx = i++
      if (idx >= items.length) return
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

export interface CanalResumen {
  propertyId: string
  portal: string
  reservas: number
  neto: number
  /** Comisión REAL medida = Σ(bruto − neto) de las reservas cuyo bruto consta. */
  comision: number
  /** Reservas sin `amount_gross`: su comisión NO está en `comision` (no consta ≠ 0€). */
  sinBruto: number
  /** commission_pct de `portal_rates`; null = el portal no está en la tabla. Un 0 aquí es un
   *  «pendiente de confirmar»: el neto = bruto y la comisión real NO está descontada — la UI
   *  lo declara vía `canales-logica.ts`, nunca lo pinta como 0€. */
  tarifaPct: number | null
}

export interface CancelacionesResumen {
  /** Por piso; property_id NULL (no casó con properties) se agrupa como '' → «sin piso». */
  filas: Array<{
    propertyId: string
    n: number
    perdidoBruto: number
    /** Cancelaciones sin importe conocido: no están en `perdidoBruto`. */
    sinImporte: number
    noches: number
    /** Cancelaciones sin noches calculables: no están en `noches`. */
    sinNoches: number
  }>
  /** La tabla `reservas_canceladas` nace el 12/08/2026: si el rango empieza antes, lo anterior
   *  es «no se sabe», no «no hubo». La UI lo declara con esta marca. */
  registroDesde: string
  rangoAnteriorAlRegistro: boolean
}

export interface PLRango {
  desde: string
  hasta: string
  meses: PLMensual[]
  agregado: PLPiso[]
  /** Mismo rango un año antes (Δ interanual + línea de referencia). null si no se pudo calcular. */
  anterior: { desde: string; hasta: string; meses: PLMensual[]; agregado: PLPiso[] } | null
  canales: CanalResumen[]
  cancelaciones: CancelacionesResumen
}

const REGISTRO_CANCELACIONES_DESDE = '2026-08-12'

function limitesRango(desde: string, hasta: string): { start: Date; end: Date } {
  const [y1, m1] = desde.split('-').map(Number)
  const [y2, m2] = hasta.split('-').map(Number)
  return { start: new Date(y1, m1 - 1, 1), end: new Date(y2, m2, 1) }
}

export async function getPLRango(desde: string, hasta: string, opts?: { fresco?: boolean }): Promise<PLRango | null> {
  const meses = mesesDelRango(desde, hasta)
  if (!meses) return null
  const mesesAnt = meses.map(m => mesAniosAtras(m))
  const { start, end } = limitesRango(desde, hasta)

  const [datosMeses, datosAnt, canalesRows, cancelRows, tarifasRows] = await Promise.all([
    enLotes(meses, CONCURRENCIA, m => getPLMensualCached(m, opts)),
    // El año anterior solo se usa agregado: si un mes revienta, el Δ se queda en null pero el
    // rango principal no cae — la comparativa es contexto, no el dato.
    enLotes(mesesAnt, CONCURRENCIA, m => getPLMensualCached(m)).catch(() => null),
    prisma.$queryRaw<Array<{ pid: string; portal: string | null; reservas: number; neto: number; comision: number; sin_bruto: number }>>`
      SELECT "propertyId" AS pid,
        portal::text AS portal,
        COUNT(*)::int AS reservas,
        COALESCE(SUM(amount), 0)::float AS neto,
        COALESCE(SUM(amount_gross - amount) FILTER (WHERE amount_gross IS NOT NULL), 0)::float AS comision,
        COUNT(*) FILTER (WHERE amount_gross IS NULL)::int AS sin_bruto
      FROM incomes
      WHERE "checkIn" >= ${start} AND "checkIn" < ${end}
      GROUP BY "propertyId", portal
    `,
    prisma.$queryRaw<Array<{ pid: string | null; n: number; perdido: number; sin_importe: number; noches: number; sin_noches: number }>>`
      SELECT property_id AS pid,
        COUNT(*)::int AS n,
        COALESCE(SUM(amount_gross), 0)::float AS perdido,
        COUNT(*) FILTER (WHERE amount_gross IS NULL)::int AS sin_importe,
        COALESCE(SUM(nights), 0)::int AS noches,
        COUNT(*) FILTER (WHERE nights IS NULL)::int AS sin_noches
      FROM reservas_canceladas
      WHERE check_in >= ${start} AND check_in < ${end}
      GROUP BY property_id
    `,
    prisma.$queryRaw<Array<{ portal: string; pct: number }>>`
      SELECT portal, commission_pct::float AS pct FROM portal_rates
    `,
  ])

  const tarifas = new Map(tarifasRows.map(r => [r.portal, Number(r.pct)]))

  return {
    desde,
    hasta,
    meses: datosMeses,
    agregado: agregarPisos(datosMeses),
    anterior: datosAnt
      ? { desde: mesesAnt[0], hasta: mesesAnt[mesesAnt.length - 1], meses: datosAnt, agregado: agregarPisos(datosAnt) }
      : null,
    canales: canalesRows.map(r => ({
      propertyId: r.pid,
      portal: r.portal ?? 'OTRO',
      reservas: Number(r.reservas),
      neto: Number(r.neto),
      comision: Math.round(Number(r.comision) * 100) / 100,
      sinBruto: Number(r.sin_bruto),
      tarifaPct: tarifas.get(r.portal ?? 'OTRO') ?? null,
    })),
    cancelaciones: {
      filas: cancelRows.map(r => ({
        propertyId: r.pid ?? '',
        n: Number(r.n),
        perdidoBruto: Math.round(Number(r.perdido) * 100) / 100,
        sinImporte: Number(r.sin_importe),
        noches: Number(r.noches),
        sinNoches: Number(r.sin_noches),
      })),
      registroDesde: REGISTRO_CANCELACIONES_DESDE,
      rangoAnteriorAlRegistro: `${desde}-01` < REGISTRO_CANCELACIONES_DESDE,
    },
  }
}

/** Heatmap de estacionalidad: P&L de los últimos `n` meses (para pintar margen piso × mes).
 *  Pesado a propósito de perezoso: solo lo pide su endpoint, que se monta al abrir la sección. */
export async function getHeatmapMeses(n = 24): Promise<PLMensual[]> {
  const d = new Date()
  d.setDate(1)
  const hasta = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  d.setMonth(d.getMonth() - (n - 1))
  const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const meses = mesesDelRango(desde, hasta, n)
  if (!meses) return []
  return enLotes(meses, CONCURRENCIA, m => getPLMensualCached(m))
}
