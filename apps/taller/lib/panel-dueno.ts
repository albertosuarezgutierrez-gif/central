/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Panel del dueño: margen por OT, horas baremo vs reales por mecánico, facturación del mes vs el anterior y estado del envío a
// contabilidad. La lógica es PURA (probada); `cargarPanel` solo lee. Regla de oro (CLAUDE.md): dato que NO hay ≠ 0. Sin coste en las
// líneas NO hay margen («sin datos»), jamás margen = ventas; sin baremo no hay rendimiento.
import { minutosParte } from '@central/module-taller'

// ─── Facturación del mes vs mes anterior ─────────────────────────────────────
export interface FilaFactura { fechaExpedicion: Date | string; estado: string; baseCent: number | bigint; totalCent: number | bigint }
export interface Periodo { base: number; total: number; facturas: number }
export interface FacturacionMensual { mes: string; actual: Periodo; anterior: Periodo; variacionPct: number | null }

const aMes = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 7)
/** AAAA-MM en hora de Madrid (el mes «de hoy» del taller, no el de UTC). */
export function mesDe(ahora: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).formatToParts(ahora)
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`
}
export function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
const periodo = (fs: FilaFactura[], mes: string): Periodo => {
  const del = fs.filter((f) => f.estado === 'emitida' && aMes(f.fechaExpedicion) === mes)
  // Las rectificativas llevan importes negativos: restan solas. Las anuladas no cuentan.
  return { base: del.reduce((s, f) => s + Number(f.baseCent), 0), total: del.reduce((s, f) => s + Number(f.totalCent), 0), facturas: del.length }
}

export function facturacionMensual(fs: FilaFactura[], ahora: Date): FacturacionMensual {
  const mes = mesDe(ahora)
  const actual = periodo(fs, mes)
  const anterior = periodo(fs, mesAnterior(mes))
  // Mes anterior sin facturación (o neto 0): no hay base de comparación → null, nunca «+∞» ni 0 %.
  const variacionPct = anterior.base > 0 ? Math.round(((actual.base - anterior.base) / anterior.base) * 1000) / 10 : null
  return { mes, actual, anterior, variacionPct }
}

// ─── Margen por OT ───────────────────────────────────────────────────────────
export interface LineaCoste { tipo: string; costeCent: number | bigint | null }
/** Líneas de material (las que tienen coste de compra): pieza y granel. La mano de obra no lleva coste aquí. */
export const TIPOS_CON_COSTE: readonly string[] = ['pieza', 'granel']
export type MargenOt =
  | { estado: 'ok'; ventasCent: number; costeCent: number; margenCent: number }
  | { estado: 'incompleto'; ventasCent: number; costeCent: null; margenCent: null; faltan: number }
  | { estado: 'sin_datos'; ventasCent: number; costeCent: null; margenCent: null }

/**
 * Margen = ventas (base facturada) − coste de los recambios. Solo con TODOS los recambios con coste:
 *   ningún coste en ninguna línea → `sin_datos` (no se muestra margen = ventas);
 *   algún recambio sin coste       → `incompleto` (un margen parcial engaña más que ninguno).
 */
export function margenOt(ventasCent: number, lineas: LineaCoste[]): MargenOt {
  const material = lineas.filter((l) => TIPOS_CON_COSTE.includes(l.tipo))
  const conCoste = material.filter((l) => l.costeCent != null)
  if (conCoste.length === 0) return { estado: 'sin_datos', ventasCent, costeCent: null, margenCent: null }
  const faltan = material.length - conCoste.length
  if (faltan > 0) return { estado: 'incompleto', ventasCent, costeCent: null, margenCent: null, faltan }
  const coste = conCoste.reduce((s, l) => s + Number(l.costeCent), 0)
  return { estado: 'ok', ventasCent, costeCent: coste, margenCent: ventasCent - coste }
}

// ─── Horas baremo vs reales por mecánico ─────────────────────────────────────
export interface ParteFila { mecanicoId: string; otId: string; inicio: Date; fin: Date | null }
export interface LineaBaremo { otId: string; baremoMinutos: number | bigint | null }
export interface HorasMecanico {
  mecanicoId: string
  realesMin: number // todos sus partes cerrados
  conBaremoMin: number // reales de las OT que tienen baremo (base de la comparación)
  baremoMin: number | null // baremo atribuido a este mecánico; null si ninguna de sus OT tiene baremo
  rendimientoPct: number | null // baremo / reales con baremo; null si falta cualquiera
  partesAbiertos: number
}

/**
 * Baremo (por OT) vs minutos reales (partes cerrados, por mecánico). El baremo de una OT se reparte entre quienes trabajaron en ella
 * EN PROPORCIÓN a sus minutos reales; una OT sin baremo no entra en la comparación (ni como 0). Partes abiertos: se cuentan aparte.
 * rendimiento > 100 % = tardó menos que el baremo.
 */
export function horasPorMecanico(partes: ParteFila[], lineas: LineaBaremo[]): HorasMecanico[] {
  const baremoOt = new Map<string, number>()
  for (const l of lineas) if (l.baremoMinutos != null) baremoOt.set(l.otId, (baremoOt.get(l.otId) ?? 0) + Number(l.baremoMinutos))
  const minutos = new Map<string, Map<string, number>>() // ot → mecánico → min
  const out = new Map<string, HorasMecanico>()
  const de = (id: string) => out.get(id) ?? out.set(id, { mecanicoId: id, realesMin: 0, conBaremoMin: 0, baremoMin: null, rendimientoPct: null, partesAbiertos: 0 }).get(id)!
  for (const p of partes) {
    const h = de(p.mecanicoId)
    const m = minutosParte({ id: '', otId: p.otId, mecanicoId: p.mecanicoId, inicio: p.inicio, fin: p.fin })
    if (m === null) { h.partesAbiertos++; continue }
    h.realesMin += m
    const porMec = minutos.get(p.otId) ?? minutos.set(p.otId, new Map()).get(p.otId)!
    porMec.set(p.mecanicoId, (porMec.get(p.mecanicoId) ?? 0) + m)
  }
  for (const [otId, porMec] of minutos) {
    const bar = baremoOt.get(otId)
    if (bar === undefined) continue
    const total = [...porMec.values()].reduce((s, x) => s + x, 0)
    if (total <= 0) continue
    for (const [mec, m] of porMec) {
      const h = de(mec)
      h.conBaremoMin += m
      h.baremoMin = (h.baremoMin ?? 0) + (bar * m) / total
    }
  }
  for (const h of out.values()) {
    if (h.baremoMin !== null) h.baremoMin = Math.round(h.baremoMin)
    h.rendimientoPct = h.baremoMin !== null && h.conBaremoMin > 0 ? Math.round((h.baremoMin / h.conBaremoMin) * 1000) / 10 : null
  }
  return [...out.values()].sort((a, b) => b.realesMin - a.realesMin)
}

// ─── Cobros del mes por medio ────────────────────────────────────────────────
export interface FilaCobro { medioCodigo: string; importeCent: number | bigint; cobradoEn: Date }
export function cobrosPorMedio(cs: FilaCobro[], mes: string): { medio: string; importeCent: number; cobros: number }[] {
  const m = new Map<string, { medio: string; importeCent: number; cobros: number }>()
  for (const c of cs) {
    if (mesDe(c.cobradoEn) !== mes) continue
    const x = m.get(c.medioCodigo) ?? m.set(c.medioCodigo, { medio: c.medioCodigo, importeCent: 0, cobros: 0 }).get(c.medioCodigo)!
    x.importeCent += Number(c.importeCent)
    x.cobros++
  }
  return [...m.values()].sort((a, b) => b.importeCent - a.importeCent)
}

// ─── Estado del envío a contabilidad ─────────────────────────────────────────
export interface FilaHecho { id: string; tipo: string; ref: string; estado: string; intentos: number | bigint; ultimoError: string | null }
export interface EstadoEnvio { pendientes: number; conError: number; rechazados: number; noSoportados: number; ultimosRechazados: FilaHecho[] }
export function estadoEnvio(hs: FilaHecho[]): EstadoEnvio {
  const n = (e: string) => hs.filter((h) => h.estado === e).length
  return {
    pendientes: n('pendiente'), conError: n('error'), rechazados: n('rechazado'), noSoportados: n('no_soportado'),
    ultimosRechazados: hs.filter((h) => h.estado === 'rechazado' || h.estado === 'error').slice(0, 20),
  }
}

// ─── Carga (solo lectura) ────────────────────────────────────────────────────
type Delegado = { findMany(a?: any): Promise<any[]> }
export type TxPanel = { cobro: Delegado; factura: Delegado; otLinea: Delegado; parteHoras: Delegado; usuarioTaller: Delegado; ordenTrabajo: Delegado; vehiculo: Delegado; hechoPendiente: Delegado; taller: { findFirst(a?: any): Promise<any> } }

export async function cargarPanel(tx: TxPanel, o: { tallerId: string; ahora: Date }) {
  const mes = mesDe(o.ahora)
  const desde = new Date(`${mesAnterior(mes)}-01T00:00:00.000Z`)
  const inicioMes = new Date(`${mes}-01T00:00:00.000Z`)
  const facturas = await tx.factura.findMany({ where: { tallerId: o.tallerId, fechaExpedicion: { gte: desde } }, take: 5000 })
  const fact = facturacionMensual(facturas, o.ahora)

  // Margen: OT con facturación este mes (ventas = todo lo facturado a esa OT, rectificativas incluidas).
  const otIds = [...new Set(facturas.filter((f) => f.estado === 'emitida' && aMes(f.fechaExpedicion) === mes).map((f) => f.otId as string))].slice(0, 100)
  const [facturasOt, lineasOt, ots] = otIds.length
    ? await Promise.all([
      tx.factura.findMany({ where: { tallerId: o.tallerId, otId: { in: otIds } } }),
      tx.otLinea.findMany({ where: { tallerId: o.tallerId, otId: { in: otIds } } }),
      tx.ordenTrabajo.findMany({ where: { tallerId: o.tallerId, id: { in: otIds } } }),
    ])
    : [[], [], []]
  const vehs = ots.length ? await tx.vehiculo.findMany({ where: { tallerId: o.tallerId, id: { in: ots.map((x) => x.vehiculoId as string) } } }) : []
  const margenes = otIds.map((id) => {
    const ot = ots.find((x) => x.id === id)
    const ventas = facturasOt.filter((f) => f.otId === id && f.estado === 'emitida').reduce((s, f) => s + Number(f.baseCent), 0)
    return {
      otId: id, numero: (ot?.numero ?? null) as number | string | null, matricula: (vehs.find((v) => v.id === ot?.vehiculoId)?.matricula ?? null) as string | null,
      margen: margenOt(ventas, lineasOt.filter((l) => l.otId === id).map((l) => ({ tipo: l.tipo, costeCent: l.costeCent ?? null }))),
    }
  })

  // Horas del mes.
  const partes = await tx.parteHoras.findMany({ where: { tallerId: o.tallerId, inicio: { gte: inicioMes } }, take: 5000 })
  const otPartes = [...new Set(partes.map((p) => p.otId as string))]
  const lineasPartes = otPartes.length ? await tx.otLinea.findMany({ where: { tallerId: o.tallerId, otId: { in: otPartes } } }) : []
  const nombres = new Map((await tx.usuarioTaller.findMany({ where: { tallerId: o.tallerId } })).map((u) => [u.id as string, u.nombre as string]))
  const horas = horasPorMecanico(partes, lineasPartes.map((l) => ({ otId: l.otId, baremoMinutos: l.baremoMinutos ?? null })))
    .map((h) => ({ ...h, nombre: nombres.get(h.mecanicoId) ?? '—' }))

  const cobros = cobrosPorMedio(await tx.cobro.findMany({ where: { tallerId: o.tallerId, cobradoEn: { gte: new Date(inicioMes.getTime() - 86_400_000) } }, take: 5000 }), mes)
  const hechos = await tx.hechoPendiente.findMany({ where: { tallerId: o.tallerId, estado: { in: ['pendiente', 'error', 'rechazado', 'no_soportado'] } }, orderBy: { creadoEn: 'desc' }, take: 500 })
  const taller = await tx.taller.findFirst({ where: { id: o.tallerId } })
  return { cobros, facturacion: fact, margenes, horas, envio: estadoEnvio(hechos), vinculado: !!taller?.contabilidadEmpresaId }
}
