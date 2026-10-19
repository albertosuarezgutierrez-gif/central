// «Pedir precio a todas» (19/10/2026): un solo botón que encola el bot de CADA compañía con integración activa del ramo.
// PURO: sin red ni envs (importable desde 'use client' y desde tests). La llamada por compañía es la MISMA de los botones
// individuales (`POST /api/correduria/tarificador/encolar`); aquí solo el orden y la lectura del resultado. Solo PRECIO.

/** Compañías cuyo `ok` de auto da el vehículo a Generali (espejo de asegura `ORIGENES_VEHICULO_ENCADENADO`). */
const ORIGENES = ['allianz', 'mapfre'] as const
/** Compañías que esperan el vehículo de las de origen (asegura las deja `pendiente` con `esperaVehiculo`). */
const ENCADENADAS = ['generali'] as const

/** Orden de encolado: primero las de origen del vehículo, luego el resto, al final las encadenadas. Estable; sin repetidas. PURA. */
export function ordenEncolado(companias: readonly string[]): string[] {
  const unicas = [...new Set(companias.map((c) => c.trim().toLowerCase()).filter(Boolean))]
  const peso = (c: string) => ((ORIGENES as readonly string[]).includes(c) ? 0 : (ENCADENADAS as readonly string[]).includes(c) ? 2 : 1)
  return unicas.map((c, i) => ({ c, i })).sort((a, b) => peso(a.c) - peso(b.c) || a.i - b.i).map((x) => x.c)
}

export type FilaLote =
  | { compania: string; estado: 'omitida'; mensaje: string }
  | { compania: string; estado: 'rechazada'; mensaje: string }
  /** Sin respuesta fiable de asegura: PUEDE haberse encolado. Ni rechazada ni encolada; no se da por fallida. */
  | { compania: string; estado: 'incierta'; mensaje: string }
  | { compania: string; estado: 'encolada'; trabajoId: string; duplicado: boolean; final: boolean; ok: boolean }

/** ¿Acabaron todos los trabajos encolados? (Rechazadas/omitidas no esperan.) Sin ninguna encolada → `false`. PURA. */
export function loteTerminado(filas: readonly FilaLote[]): boolean {
  const enc = filas.filter((f): f is Extract<FilaLote, { estado: 'encolada' }> => f.estado === 'encolada')
  return enc.length > 0 && enc.every((f) => f.final)
}

/** ¿Hay algún trabajo terminado con `ok` (hay con qué preparar el borrador del presupuesto)? PURA. */
export function loteConOk(filas: readonly FilaLote[]): boolean {
  return filas.some((f) => f.estado === 'encolada' && f.ok)
}

/** Resumen de una línea: «3 compañías: 2 encoladas, 1 rechazada». PURA. */
export function resumenLote(filas: readonly FilaLote[]): string {
  const n = (e: FilaLote['estado']) => filas.filter((f) => f.estado === e).length
  const partes = [`${n('encolada')} encolada${n('encolada') === 1 ? '' : 's'}`]
  if (n('rechazada')) partes.push(`${n('rechazada')} rechazada${n('rechazada') === 1 ? '' : 's'}`)
  if (n('incierta')) partes.push(`${n('incierta')} por confirmar`)
  if (n('omitida')) partes.push(`${n('omitida')} sin pedir`)
  return `${filas.length} compañía${filas.length === 1 ? '' : 's'}: ${partes.join(', ')}`
}
