// Actividad del CLIENTE en su presupuesto (29/09/2026): qué garantías marca y qué opciones compara
// en el portal. PURO: la BD vive en `presupuesto-actividad-servicio.ts`.
//
// Para qué: que Alberto, antes de llamar, sepa que el cliente «ha mirado lunas y asistencia y ha
// comparado Allianz con Reale». Es telemetría, no una decisión del cliente: nada de esto le obliga
// a nada ni cambia el presupuesto.
//
// 🚨 Lo que el portal manda NO se cree: las garantías se recortan al catálogo del ramo de ESE
// presupuesto y las opciones comparadas a las VISIBLES de ese presupuesto. Un id ajeno, una clave
// inventada o una opción oculta se tiran en silencio (no es un error del cliente: es ruido).

import { CATALOGO_GARANTIAS, ramoDeCatalogo } from '@central/module-seguros'

export const TIPO_ACTIVIDAD = 'actividad_cliente'
export const MAX_GARANTIAS = 20
export const MAX_COMPARADAS = 5
/** Un detalle IDÉNTICO dentro de esta ventana no se vuelve a guardar (recargas, doble envío). */
export const VENTANA_DUPLICADO_MS = 10 * 60_000
/** Tope de eventos de actividad por presupuesto en 24 h: un bucle del portal no llena el libro. */
export const MAX_ACTIVIDAD_DIA = 30

export type DetalleActividad = { garantias: string[]; comparadas: string[] }

const listaDeTextos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : []

/** Las claves del catálogo del ramo, en su orden. `[]` si el ramo no tiene catálogo. */
export function clavesDelRamo(ramo: string | null | undefined): string[] {
  const r = ramoDeCatalogo(ramo)
  return r ? CATALOGO_GARANTIAS[r].map((g) => g.clave) : []
}

/**
 * Lo que se guarda: garantías ⊆ catálogo del ramo (en el orden del catálogo, sin repetir, máx.
 * 20) y comparadas ⊆ opciones visibles (ordenadas, sin repetir, máx. 5). Ordenar es lo que hace
 * que dos envíos con los mismos datos en otro orden sean el MISMO detalle para el antiduplicado.
 */
export function normalizarActividad(
  entrada: { garantias: unknown; comparadas: unknown },
  contexto: { ramo: string; opcionesVisibles: readonly string[] },
): DetalleActividad {
  const pedidas = new Set(listaDeTextos(entrada.garantias))
  const garantias = clavesDelRamo(contexto.ramo).filter((k) => pedidas.has(k)).slice(0, MAX_GARANTIAS)
  const visibles = new Set(contexto.opcionesVisibles.map((id) => id.toLowerCase()))
  const comparadas = [...new Set(listaDeTextos(entrada.comparadas).map((id) => id.toLowerCase()))]
    .filter((id) => visibles.has(id))
    .sort()
    .slice(0, MAX_COMPARADAS)
  return { garantias, comparadas }
}

const firma = (d: DetalleActividad) => JSON.stringify([d.garantias, d.comparadas])

/** Lee un detalle guardado. Lo que no tenga la forma se ignora (nunca rompe la decisión). */
export function detalleGuardado(v: unknown): DetalleActividad | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.garantias) || !Array.isArray(o.comparadas)) return null
  return { garantias: listaDeTextos(o.garantias), comparadas: listaDeTextos(o.comparadas) }
}

export type DecisionActividad = 'guardar' | 'vacia' | 'duplicada' | 'limite'

/**
 * ¿Se guarda este detalle? `recientes` = detalles de actividad de los últimos 10 min;
 * `enUltimas24h` = cuántos eventos de actividad hay en 24 h.
 * Un detalle vacío no dice nada y no se guarda (no es «no le interesa nada»).
 */
export function decidirActividad(
  detalle: DetalleActividad,
  historial: { recientes: readonly unknown[]; enUltimas24h: number },
): DecisionActividad {
  if (detalle.garantias.length === 0 && detalle.comparadas.length === 0) return 'vacia'
  const f = firma(detalle)
  if (historial.recientes.some((r) => { const d = detalleGuardado(r); return d !== null && firma(d) === f })) return 'duplicada'
  if (historial.enUltimas24h >= MAX_ACTIVIDAD_DIA) return 'limite'
  return 'guardar'
}
