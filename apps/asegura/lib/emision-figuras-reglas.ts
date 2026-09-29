/**
 * Reglas PURAS de «emitir una variante con otras personas» (29/09/2026). Sin BD: las usa
 * `emision-figuras.ts` y se prueban por comportamiento en `emision-figuras-reglas.test.ts`.
 */
export type RolComparado = 'tomador' | 'propietario' | 'conductor_habitual'
export type CambioRiesgo =
  | { campo: RolComparado; antes: string | null; despues: string | null }
  | { campo: 'cp'; antes: string | null; despues: string | null }

type Variante = { figuras: unknown; clienteId: string | null; peticion: unknown }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const id = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Quién ocupa cada papel. Sin foto de figuras (variantes viejas): el tomador en todos, que es lo que se mandó. */
export function papelesDe(v: Variante): Record<RolComparado, string | null> {
  const f = esObjeto(v.figuras) ? v.figuras : {}
  const tomador = id(f.tomador) ?? v.clienteId
  return {
    tomador,
    propietario: id(f.propietario) ?? tomador,
    conductor_habitual: id(f.conductor_habitual) ?? tomador,
  }
}

/** El CP de circulación que viajó al vendor (auto y moto: `risk.circulationAddress.postalCode`). */
export function cpDe(peticion: unknown): string | null {
  const risk = esObjeto(peticion) && esObjeto(peticion.risk) ? peticion.risk : null
  const dir = risk && esObjeto(risk.circulationAddress) ? risk.circulationAddress : null
  const cp = dir ? dir.postalCode : null
  return typeof cp === 'string' && cp.trim() !== '' ? cp.trim() : null
}

/** Qué cambia la variante que se emite respecto a la primera del riesgo. Vacío = mismas personas y CP. */
export function cambiosDeFiguras(primera: Variante, esta: Variante): CambioRiesgo[] {
  const a = papelesDe(primera)
  const b = papelesDe(esta)
  const out: CambioRiesgo[] = []
  for (const rol of ['tomador', 'propietario', 'conductor_habitual'] as const) {
    // Un papel que no se sabe en uno de los dos lados no se puede comparar: no se afirma un cambio.
    if (a[rol] && b[rol] && a[rol] !== b[rol]) out.push({ campo: rol, antes: a[rol], despues: b[rol] })
  }
  const cpA = cpDe(primera.peticion)
  const cpB = cpDe(esta.peticion)
  if (cpA && cpB && cpA !== cpB) out.push({ campo: 'cp', antes: cpA, despues: cpB })
  return out
}

export type Confirmacion = 'conductor' | 'cp' | 'cliente'

/** Qué casillas tiene que marcar el corredor: la del conductor si cambian las personas, la del CP si cambia, y SIEMPRE la del cliente. */
export function confirmacionesExigidas(cambios: CambioRiesgo[]): Confirmacion[] {
  if (cambios.length === 0) return []
  const out: Confirmacion[] = []
  if (cambios.some((c) => c.campo !== 'cp')) out.push('conductor')
  if (cambios.some((c) => c.campo === 'cp')) out.push('cp')
  out.push('cliente')
  return out
}

/** Las que faltan en lo que mandó la pantalla (`figurasConfirmadas: string[]`). Solo cuenta un array de textos exactos. */
export function faltanConfirmaciones(exigidas: Confirmacion[], enviadas: unknown): Confirmacion[] {
  const marcadas = new Set(Array.isArray(enviadas) ? enviadas.filter((x): x is string => typeof x === 'string') : [])
  return exigidas.filter((c) => !marcadas.has(c))
}

