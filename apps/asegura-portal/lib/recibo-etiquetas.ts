/** Rótulos de un recibo para el CLIENTE. Puro. Nunca comisiones ni prima neta. */

const CLASES: Record<string, string> = { CA: 'Renovación', NP: 'Nueva contratación', SU: 'Suplemento' }

/** Código desconocido → tal cual; sin dato → `null` (no se pinta). */
export function etiquetaClaseRecibo(clase: string | null | undefined): string | null {
  const c = (clase ?? '').trim()
  if (c === '') return null
  return CLASES[c.toUpperCase()] ?? c
}

const VERBO: Record<string, string> = { cobrado: 'Cobrado', devuelto: 'Devuelto', anulado: 'Anulado' }

/** «Cobrado el 05/03/2026». `fecha` ya viene formateada; sin ella o en otra situación, `null`. */
export function textoSituacionConFecha(situacion: string, fecha: string | null): string | null {
  const v = VERBO[situacion.trim().toLowerCase()]
  return v && fecha ? `${v} el ${fecha}` : null
}
