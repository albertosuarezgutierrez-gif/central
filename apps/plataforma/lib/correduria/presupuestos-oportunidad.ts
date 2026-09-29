/**
 * Los presupuestos DENTRO de cada oportunidad (29/09/2026). Alberto vio en la ficha tres bloques
 * —Oportunidades, Presupuestos, Presupuestos en Avant2— y preguntó por qué iban por separado. El eje
 * es la oportunidad (no el DNI: una variante a nombre del hijo vive en la oportunidad del padre), así
 * que cada oportunidad dice lo pedido para ella, y lo tarificado sin oportunidad sale en su grupo.
 * PURO: lo lee la pantalla y lo cubre su test.
 */
import { eur } from '../dinero.ts'
import { ROTULO_ESTADO_PRESUPUESTO, type EstadoPresupuestoLista } from '../presupuesto-asegura.ts'

/**
 * El último presupuesto preparado para el cliente. El estado lo calcula asegura con la misma regla que
 * la lista de presupuestos (`estadoPresupuesto()`): aquí no se re-deriva. `null` = un estado que esta
 * versión no conoce (se dice, no se adivina).
 */
export type HitosPresupuesto = { creadoAt: string; estado: EstadoPresupuestoLista | null }

export type ResumenPresupuestos = {
  /** 0 = aún no se ha pedido precio para este riesgo. */
  variantes: number
  mejorPrima: number | null
  mejorCompania: string | null
  presupuesto: HitosPresupuesto | null
}

export type PresupuestoSinOportunidad = {
  tarificacionId: string
  creadoAt: string
  ramo: string | null
  polizaId: string | null
  simulado: boolean
  mejorPrima: number | null
  mejorCompania: string | null
  presupuesto: HitosPresupuesto | null
}

type J = Record<string, unknown>
const obj = (v: unknown): J | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function leerHitos(v: unknown): HitosPresupuesto | null {
  const h = obj(v)
  const creadoAt = txt(h?.creadoAt)
  if (!h || !creadoAt) return null
  const e = txt(h.estado)
  return { creadoAt, estado: e !== null && e in ROTULO_ESTADO_PRESUPUESTO ? (e as EstadoPresupuestoLista) : null }
}

/** `null` = asegura no lo manda (versión anterior): la pantalla no dice nada en vez de «sin precio». */
export function leerResumenPresupuestos(v: unknown): ResumenPresupuestos | null {
  const r = obj(v)
  const variantes = num(r?.variantes)
  if (!r || variantes === null) return null
  return { variantes, mejorPrima: num(r.mejorPrima), mejorCompania: txt(r.mejorCompania), presupuesto: leerHitos(r.presupuesto) }
}

/** `null` = no se pudo leer (o asegura no lo manda): nunca se pinta como «no hay». */
export function leerSinOportunidad(v: unknown): PresupuestoSinOportunidad[] | null {
  if (!Array.isArray(v)) return null
  const out: PresupuestoSinOportunidad[] = []
  for (const f of v) {
    const r = obj(f)
    const tarificacionId = txt(r?.tarificacionId)
    const creadoAt = txt(r?.creadoAt)
    // Una fila sin forma es un contrato roto: se declara ilegible la lista entera, no se esconde la fila.
    if (!r || !tarificacionId || !creadoAt) return null
    out.push({
      tarificacionId,
      creadoAt,
      ramo: txt(r.ramo),
      polizaId: txt(r.polizaId),
      simulado: r.simulado === true,
      mejorPrima: num(r.mejorPrima),
      mejorCompania: txt(r.mejorCompania),
      presupuesto: leerHitos(r.presupuesto),
    })
  }
  return out
}

/** «al cliente: …», con el mismo rótulo que la lista de presupuestos. */
function alCliente(h: HitosPresupuesto | null): string {
  if (!h) return 'no enviado al cliente'
  return h.estado ? `al cliente: ${ROTULO_ESTADO_PRESUPUESTO[h.estado].toLowerCase()}` : 'al cliente: estado no reconocido'
}

function mejor(prima: number | null, compania: string | null): string | null {
  if (prima === null) return null
  return `mejor ${eur(prima)}${compania ? ` ${compania}` : ''}`
}

/** Una línea para la tarjeta de la oportunidad: qué se ha pedido y en qué punto está con el cliente. */
export function textoPresupuestos(r: ResumenPresupuestos): string {
  if (r.variantes === 0) return 'Aún no se ha pedido precio.'
  const partes = [r.variantes === 1 ? '1 presupuesto pedido' : `${r.variantes} presupuestos pedidos`]
  const m = mejor(r.mejorPrima, r.mejorCompania)
  partes.push(m ?? 'sin precio real')
  partes.push(alCliente(r.presupuesto))
  return partes.join(' · ')
}

/** La fila de una tarificación sin oportunidad. */
export function textoSinOportunidad(p: PresupuestoSinOportunidad): string {
  const partes: string[] = [p.polizaId ? 'retarificación de su póliza' : 'alta nueva']
  if (p.simulado) partes.push('simulado (sin precio real)')
  else partes.push(mejor(p.mejorPrima, p.mejorCompania) ?? 'sin precio')
  partes.push(alCliente(p.presupuesto))
  return partes.join(' · ')
}

/**
 * Dónde se abre. Una retarificación, en la pantalla de SU póliza (la de alta nueva buscaría una
 * tarificación con cliente y sin póliza y abriría otra, o ninguna). `null` = ramo sin pantalla.
 */
export function rutaSinOportunidad(clienteId: string, p: Pick<PresupuestoSinOportunidad, 'ramo' | 'polizaId'>): string | null {
  if (p.polizaId) return `/correduria/poliza/${encodeURIComponent(p.polizaId)}/retarificar`
  if (p.ramo !== 'auto' && p.ramo !== 'moto' && p.ramo !== 'hogar') return null
  return `/correduria/cliente/${encodeURIComponent(clienteId)}/${p.ramo}-nuevo`
}
