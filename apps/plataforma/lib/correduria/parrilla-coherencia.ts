// Lo que la parrilla de precios y el panel de emisión tienen que decir con coherencia (29/09/2026).
// PURO: lo importan los componentes cliente y lo vigila su `.test.ts`.
//
// Caso fundacional (proyecto 40975463): Mapfre salía en «no dicen si incluyen grúa» porque sus
// coberturas aún no se habían leído; los avisos de «requiere aceptación de la compañía» solo se veían
// después de confirmar el precio; Generali (fallo técnico de Avant2) y Allianz (vehículo no permitido)
// se pintaban igual; y al emitir se mandaba la prima estimada, no la confirmada.

import { eur } from '../dinero.ts'

/** Las opciones cuyas coberturas aún no se han leído (`garantias === null`) van aparte: no son «no dice». */
export function partirSinLeer<T extends { garantias: unknown | null }>(xs: readonly T[]): { leidas: T[]; sinLeer: T[] } {
  const leidas: T[] = []
  const sinLeer: T[] = []
  for (const x of xs) (x.garantias === null ? sinLeer : leidas).push(x)
  return { leidas, sinLeer }
}

/**
 * Lo que es IGUAL en todas las filas se dice una vez en la cabecera y no en cada fila: repetido ocho
 * veces es ruido que tapa lo que sí distingue a un precio de otro.
 */
export function comunesParrilla(xs: readonly { franquiciaEur: number | null; firmeza: string }[]): {
  franquiciaNoDeclaradaEnTodas: boolean
  firmezaComun: string | null
} {
  if (xs.length === 0) return { franquiciaNoDeclaradaEnTodas: false, firmezaComun: null }
  const firmezas = new Set(xs.map((x) => x.firmeza))
  return {
    franquiciaNoDeclaradaEnTodas: xs.every((x) => x.franquiciaEur === null),
    firmezaComun: firmezas.size === 1 ? [...firmezas][0] : null,
  }
}

const PREFIJO_OBSERVACIONES = /^observaciones de la compa[ñn][ií]a:\s*/i
/** Lo que la compañía tiene que revisar antes de aceptar: se puede mandar, pero no es una póliza segura. */
const RE_REVISION = /aceptaci[oó]n|condicionad|consulta sinco|revisad|pendiente/i

/**
 * Los avisos de la compañía que el corredor tiene que ver EN LA FILA, antes de mandar o emitir. El de
 * póliza bloqueada ya lo pinta `textoBloqueoCorredor` y no se repite. `revision` = alguno dice que la
 * compañía tiene que aceptar o revisar el riesgo.
 */
export function avisosCompania(avisos: readonly string[] | null | undefined): { revision: boolean; textos: string[] } {
  const textos = (avisos ?? [])
    .filter((a): a is string => typeof a === 'string' && a.trim() !== '' && !/BLOQUEAD[AO]/i.test(a))
    .map((a) => a.trim().replace(PREFIJO_OBSERVACIONES, ''))
  return { revision: textos.some((t) => RE_REVISION.test(t)), textos }
}

export type TipoFallo = 'tecnico' | 'rechazo' | 'otro'

const RE_TECNICO = /c[oó]digo\s*\d+|se ha producido un error|soporte|timeout|tiempo de espera|no disponible|error interno/i
const RE_RECHAZO = /no permitid|no asegurable|no se admite|fuera de norma|rechaz|no se puede asegurar|no cumple/i

/**
 * Por qué una compañía no dio precio. NO es lo mismo «la compañía no asegura este riesgo» que «falló
 * el envío»: lo primero es una respuesta, lo segundo un hueco (esa compañía no se ha podido mirar).
 * El texto original se conserva siempre; esto solo pone el titular.
 */
export function tipoFallo(motivo: string | null | undefined): TipoFallo {
  const m = (motivo ?? '').trim()
  if (m === '') return 'otro'
  if (RE_TECNICO.test(m)) return 'tecnico'
  if (RE_RECHAZO.test(m)) return 'rechazo'
  return 'otro'
}

export function titularFallo(tipo: TipoFallo): string {
  if (tipo === 'tecnico') return 'Fallo técnico del envío: no es un rechazo de la compañía, no se ha podido mirar su precio. Avísalo a soporte de Avant2; volver a pedir precio cuesta 0,50€.'
  if (tipo === 'rechazo') return 'La compañía no asegura este riesgo con estos datos.'
  return 'La compañía no dio precio.'
}

/**
 * La compañía confirmó OTRA prima distinta de la estimada de la parrilla. Se dice, y es la confirmada
 * la que se emite. `null` = no hay cambio (o falta una de las dos).
 */
export function cambioDePrecio(enPantalla: number | null, confirmado: number | null): string | null {
  if (enPantalla === null || confirmado === null) return null
  const d = Math.round((confirmado - enPantalla) * 100) / 100
  if (Math.abs(d) < 0.01) return null
  return `La compañía lo ha confirmado a ${eur(confirmado)}, no a los ${eur(enPantalla)} de la parrilla (${d > 0 ? '+' : ''}${eur(d)}). Se emite con el confirmado.`
}
