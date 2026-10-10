/**
 * En qué punto está el siniestro de un PARTE, dicho al CLIENTE (03/10/2026, idea 4).
 *
 * Traduce (estado del parte + lo mínimo del siniestro vinculado) → un paso visible y
 * una frase corta. Cuatro pasos simples: Recibido → Comunicado a la compañía →
 * En tramitación → Cerrado.
 *
 * Reglas que sostienen el fichero:
 * - 🚨 Un parte enviado NO es siniestro comunicado: pasar de «Recibido» exige
 *   `comunicadoACompania(estadoParte)` (la única fuente), aunque haya un siniestro
 *   vinculado (puede ser un alta manual nuestra que la compañía aún no conoce).
 * - 🔒 La ENTRADA solo tiene sitio para lo que el cliente puede ver: estado, nº de
 *   la compañía y dos booleanos. Ni reserva, ni nombre de perito/tramitador, ni
 *   notas internas, ni datos de terceros entran en el tipo: no se pueden colar.
 * - `null` = no se sabe ≠ «no hay»: `peritoAsignado: null` no dice «sin perito»; `indemnizado: null`
 *   no dice «sin indemnización». Un dato ausente no se afirma.
 * - RECHAZADO no es CERRADO a secas: se dice que la compañía lo rechazó.
 * - Sin siniestro vinculado: «Recibido, lo estamos gestionando».
 */
import { comunicadoACompania, type ParteEstado } from './parte-siniestro.ts'

export type ClavePasoParte = 'recibido' | 'comunicado' | 'en_tramitacion' | 'cerrado'

export const PASOS_PARTE: readonly { clave: ClavePasoParte; etiqueta: string }[] = [
  { clave: 'recibido', etiqueta: 'Recibido' },
  { clave: 'comunicado', etiqueta: 'Comunicado a la compañía' },
  { clave: 'en_tramitacion', etiqueta: 'En tramitación' },
  { clave: 'cerrado', etiqueta: 'Cerrado' },
]

/** Lo ÚNICO del siniestro vinculado que entra aquí. */
export type SiniestroParaSeguimiento = {
  /** `abierto` · `en_tramitacion` · `cerrado` · `rechazado`. */
  estado: string
  /** Nº de siniestro de la compañía; `null` = no consta. */
  referencia: string | null
  /** `true` = consta perito asignado; `null` = no se sabe (NO «sin perito»). */
  peritoAsignado: boolean | null
  /** `true` = consta indemnización; `false` = la compañía informa 0; `null` = no se sabe. Sin importes. */
  indemnizado: boolean | null
}

export type EntradaSeguimientoParte = {
  estadoParte: string
  /** `null` = sin siniestro vinculado (o este lector no lo ve). */
  siniestro: SiniestroParaSeguimiento | null
}

export type PasoVisibleParte = { clave: ClavePasoParte; etiqueta: string; hecho: boolean; actual: boolean }

export type SeguimientoParte = {
  /** `descartado` no es un paso de la línea: el parte no sigue adelante. */
  paso: ClavePasoParte | 'descartado'
  /** Línea de pasos con el actual marcado. Vacía si `descartado`. */
  pasos: PasoVisibleParte[]
  /** Frase corta, ya para pintar. */
  texto: string
  /** Nº de siniestro de la compañía, si consta y el paso lo permite. */
  referencia: string | null
  /** `true` si la compañía lo cerró rechazándolo (se pinta distinto de un cierre normal). */
  rechazado: boolean
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Indemnización informada por la compañía → sí/no/no se sabe. Sin importes. */
export function indemnizadoDe(indemnizacion: number | null, totalPagado: number | null): boolean | null {
  if ((totalPagado ?? 0) > 0 || (indemnizacion ?? 0) > 0) return true
  if (indemnizacion === 0) return false
  return null
}

/** Hay perito en lo que informa la compañía → `true`; si no consta, `null` (nunca `false`). */
export function peritoAsignadoDe(perito: unknown): true | null {
  return perito !== null && perito !== undefined ? true : null
}

function pasos(actual: ClavePasoParte): PasoVisibleParte[] {
  const i = PASOS_PARTE.findIndex((p) => p.clave === actual)
  return PASOS_PARTE.map((p, k) => ({ ...p, hecho: k <= i, actual: k === i }))
}

export function seguimientoDeParte(e: EntradaSeguimientoParte): SeguimientoParte {
  if (e.estadoParte === 'descartado') {
    return {
      paso: 'descartado',
      pasos: [],
      texto: 'Revisado: no seguimos adelante con este parte · si crees que es un error, escríbenos',
      referencia: null,
      rechazado: false,
    }
  }

  const comunicado = comunicadoACompania(e.estadoParte as ParteEstado)
  const s = e.siniestro
  // Sin vínculo, o parte aún no comunicado: lo único cierto es que lo tenemos nosotros.
  if (!comunicado) {
    return { paso: 'recibido', pasos: pasos('recibido'), texto: 'Recibido, lo estamos gestionando', referencia: null, rechazado: false }
  }
  const referencia = s ? texto(s.referencia) : null
  const nro = referencia ? ` · nº de siniestro ${referencia}` : ''
  const estado = s ? s.estado.trim().toLowerCase() : null

  if (estado === 'en_tramitacion') {
    return {
      paso: 'en_tramitacion',
      pasos: pasos('en_tramitacion'),
      texto: `${s!.peritoAsignado === true ? 'En tramitación · ya tiene perito asignado' : 'En tramitación · en gestión'}${nro}`,
      referencia,
      rechazado: false,
    }
  }
  if (estado === 'cerrado') {
    const ind = s!.indemnizado === true ? ' · con indemnización' : s!.indemnizado === false ? ' · sin indemnización' : ''
    return { paso: 'cerrado', pasos: pasos('cerrado'), texto: `Cerrado${ind}${nro}`, referencia, rechazado: false }
  }
  if (estado === 'rechazado') {
    return { paso: 'cerrado', pasos: pasos('cerrado'), texto: `Cerrado: la compañía ha rechazado el siniestro${nro}`, referencia, rechazado: true }
  }
  // `abierto`, sin vínculo legible o un estado que no conocemos: lo conservador es «comunicado».
  return { paso: 'comunicado', pasos: pasos('comunicado'), texto: `Comunicado a tu compañía${nro}`, referencia, rechazado: false }
}
