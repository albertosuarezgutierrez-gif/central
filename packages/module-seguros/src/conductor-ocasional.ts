// CONDUCTOR OCASIONAL del riesgo de coche en TRES estados (15/10/2026). PURO, sin E/S.
//
// Hasta hoy un hueco en el papel «conductor ocasional» se leía como «no hay ocasional»: nadie había preguntado y el
// precio se pedía igual. Declarar el riesgo es obligación del tomador (art. 10 LCS) y no preguntar por otro conductor
// es la reticencia típica de un siniestro con el hijo al volante. Ahora:
//   · `si`            — hay una ficha en el papel (`oportunidad_figura`, rol `conductor_ocasional`).
//   · `ninguno`       — la corredora CONFIRMÓ que no conduce nadie más: `info_riesgo.conductorOcasional`
//                       = `{ ninguno: true, confirmadoAt, actor }` (jsonb del riesgo que ya existe: sin migración).
//   · `sin_preguntar` — ni ficha ni confirmación. NULL = «no se sabe», nunca «no hay».
// Lo que VIAJA no cambia: sin ficha no hay `secondaryDriver`, se haya confirmado o no.

/** Clave de `seguros.oportunidades.info_riesgo` donde se guarda la confirmación. */
export const CLAVE_OCASIONAL_INFO = 'conductorOcasional'

export type ConfirmacionSinOcasional = { confirmadoAt: string; actor: string | null }

/**
 * PURA. Lee la confirmación de `info_riesgo`. Solo `{ ninguno: true, confirmadoAt: <texto> }` cuenta: cualquier otra
 * forma (ausente, `ninguno: false`, sin fecha) es `null` = sin confirmar.
 */
export function confirmacionSinOcasionalDe(info: unknown): ConfirmacionSinOcasional | null {
  if (typeof info !== 'object' || info === null || Array.isArray(info)) return null
  const c = (info as Record<string, unknown>)[CLAVE_OCASIONAL_INFO]
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return null
  const o = c as Record<string, unknown>
  if (o.ninguno !== true || typeof o.confirmadoAt !== 'string' || o.confirmadoAt.trim() === '') return null
  return { confirmadoAt: o.confirmadoAt, actor: typeof o.actor === 'string' && o.actor.trim() !== '' ? o.actor : null }
}

/** PURA. El valor que se escribe en `info_riesgo.conductorOcasional` al confirmar «no hay ocasional». */
export function valorSinOcasional(ahora: string, actor: string): { ninguno: true; confirmadoAt: string; actor: string } {
  return { ninguno: true, confirmadoAt: ahora, actor }
}

export type EstadoOcasional = 'si' | 'ninguno' | 'sin_preguntar'
