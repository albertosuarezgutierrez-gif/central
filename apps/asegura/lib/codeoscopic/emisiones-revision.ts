// Cola de REVISIÓN de emisiones de Codeoscopic: lectura paginada y «marcar revisada» (03/10/2026).
// PURO (sin BD ni red): las rutas `emisiones-revision` solo cablean consultas. La tabla la llena el
// descubrimiento (`descubrir-emisiones.ts`); aquí una PERSONA la cierra desde /correduria.
//
// 🚨 `resuelta_por = 'descubrimiento'` está RESERVADO: lo escribe el descubrimiento cuando una pasada
// posterior registra el proyecto, y `descartadoPorPersona` lo usa para distinguir «lo cerró una
// persona» (no se vuelve a mirar). Una persona nunca puede firmar con ese valor.
// Sin PII: ni nombre ni documento. La nota es texto libre de la persona, acotada.

import { leerActor } from '../actor.ts'

export const LIMITE_POR_DEFECTO = 50
export const LIMITE_MAX = 100
export const NOTA_MAX = 300
export const RESUELTA_POR_RESERVADO = 'descubrimiento'

/** Página pedida: valores raros caen al defecto, nunca a «todo». */
export function leerPagina(limite: string | null, desde: string | null): { limite: number; desde: number } {
  const l = Number(limite)
  const d = Number(desde)
  return {
    limite: Number.isInteger(l) && l >= 1 ? Math.min(l, LIMITE_MAX) : LIMITE_POR_DEFECTO,
    desde: Number.isInteger(d) && d >= 0 ? d : 0,
  }
}

/** Quién firma el cierre: `humano:<cuentaId>` / `agente:<id>` de `x-actor`; si no, `manual`. */
export function quienResuelve(cabeceraActor: string | null): string {
  const a = leerActor(cabeceraActor)
  if (a.tipo === 'desconocido') return 'manual'
  // Siempre lleva prefijo `tipo:`, así que nunca puede ser igual al valor reservado.
  return `${a.tipo}:${a.id}`
}

/** Nota opcional: recortada, sin saltos de línea; vacía = sin nota. */
export function limpiarNota(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim().slice(0, NOTA_MAX)
  return t === '' ? null : t
}

export type Resolucion =
  | { status: 200; estado: 'resuelta' | 'ya_resuelta'; id: string }
  | { status: 404; estado: 'error'; mensaje: string }

/**
 * Idempotencia: el UPDATE solo toca filas abiertas. Si cambió una → `resuelta`. Si no cambió ninguna
 * y la fila existe → `ya_resuelta` (200, sin pisar quién ni cuándo la cerró). Si no existe → 404.
 */
export function decidirResolucion(id: string, actualizadas: number, existe: boolean): Resolucion {
  if (actualizadas > 0) return { status: 200, estado: 'resuelta', id }
  if (existe) return { status: 200, estado: 'ya_resuelta', id }
  return { status: 404, estado: 'error', mensaje: 'esa revisión no existe' }
}
