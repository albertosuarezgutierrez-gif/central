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

import type { RolFigura } from './variantes-riesgo.ts'

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

/**
 * Con `no_aplica` = el ramo no tiene ocasional (moto, hogar…). Es el mismo estado que pinta la pantalla (plataforma,
 * `figuras-form.ts` lo re-exporta) y el que corta en asegura antes de pagar: UNA regla para los dos lados.
 */
export type EstadoOcasionalRiesgo = EstadoOcasional | 'no_aplica'

/**
 * PURA. El ocasional del riesgo en tres estados (más `no_aplica`). Con ficha en el papel, `si` (una confirmación vieja
 * no cuenta); sin ficha, `ninguno` solo si alguien CONFIRMÓ; si no, `sin_preguntar`. `conductorOcasional: null` (no
 * se sabe) también es `sin_preguntar`: el estado conservador.
 */
export function estadoOcasional(r: {
  roles: readonly RolFigura[]
  figuras: readonly { rol: RolFigura }[]
  conductorOcasional: { ningunoConfirmadoAt: string | null } | null
}): EstadoOcasionalRiesgo {
  if (!r.roles.includes('conductor_ocasional')) return 'no_aplica'
  if (r.figuras.some((f) => f.rol === 'conductor_ocasional')) return 'si'
  return r.conductorOcasional?.ningunoConfirmadoAt ? 'ninguno' : 'sin_preguntar'
}

/** El texto del corte (y del ✗ de la verificación): qué falta y dónde se arregla. */
export const MOTIVO_OCASIONAL_SIN_PREGUNTAR =
  '¿Conduce alguien más? El conductor ocasional está sin preguntar: añádelo o confirma «no conduce nadie más» en Intervinientes. No se ha pedido precio (0,00€).'

/**
 * PURA. ¿Se corta el precio por el ocasional? Solo `sin_preguntar` corta (15/10/2026: no preguntar por otro conductor
 * es la reticencia típica, art. 10 LCS). Devuelve el motivo, o `null` si se puede pedir.
 */
export function corteOcasional(estado: EstadoOcasionalRiesgo): string | null {
  return estado === 'sin_preguntar' ? MOTIVO_OCASIONAL_SIN_PREGUNTAR : null
}
