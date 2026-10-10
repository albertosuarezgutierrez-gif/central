/**
 * Reglas PURAS de «emitir una variante con otras personas» (29/09/2026). Sin BD: las usa
 * `emision-figuras.ts` y se prueban por comportamiento en `emision-figuras-reglas.test.ts`.
 *
 * 🚨 Se compara lo que VIAJÓ a la compañía (`tarificaciones.peticion`), no la foto de figuras:
 * la foto solo guarda personas con ficha, y un conductor tecleado a mano (o una cotización sin
 * riesgo, con la foto a NULL) se colaría como «el tomador». La identidad es el DNI de cada papel;
 * el nombre solo se usa para pintarlo. Solo se compara el MISMO vehículo (misma matrícula): una
 * oportunidad agrupa el ramo del cliente y puede tener dos coches.
 */
export type Papel = 'tomador' | 'propietario' | 'conductor_habitual' | 'conductor_ocasional'
export type CambioRiesgo = { campo: Papel | 'cp'; antes: string | null; despues: string | null }

type Persona = { dni: string; nombre: string | null }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const txt = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

function persona(v: unknown): Persona | null | undefined {
  if (v === undefined || v === null) return null
  if (!esObjeto(v)) return undefined
  const doc = esObjeto(v.identificationDocument) ? v.identificationDocument : null
  const dni = txt(doc?.id)?.toUpperCase().replace(/[\s-]/g, '') ?? null
  if (!dni) return undefined
  const nombre = [txt(v.name), txt(v.surname), txt(v.surname2)].filter(Boolean).join(' ') || null
  return { dni, nombre }
}

/**
 * Quién ocupa cada papel en la petición. `undefined` = no se puede leer (no se compara); `null` =
 * nadie (solo tiene sentido en el ocasional: declarar uno menos también cambia el riesgo).
 */
export function personasDe(peticion: unknown): Record<Papel, Persona | null | undefined> | null {
  if (!esObjeto(peticion) || !esObjeto(peticion.risk)) return null
  const r = peticion.risk
  return {
    tomador: persona(peticion.holder) ?? undefined,
    propietario: persona(r.owner) ?? undefined,
    conductor_habitual: persona(r.primaryDriver) ?? undefined,
    conductor_ocasional: persona(r.secondaryDriver),
  }
}

/** La matrícula que viajó, normalizada. `null` = no es un vehículo o no consta: no se compara. */
export function matriculaDe(peticion: unknown): string | null {
  const risk = esObjeto(peticion) && esObjeto(peticion.risk) ? peticion.risk : null
  return txt(risk?.registrationPlate)?.toUpperCase().replace(/[\s-]/g, '') ?? null
}

/** El CP de circulación que viajó (auto y moto: `risk.circulationAddress.postalCode`). */
export function cpDe(peticion: unknown): string | null {
  const risk = esObjeto(peticion) && esObjeto(peticion.risk) ? peticion.risk : null
  const dir = risk && esObjeto(risk.circulationAddress) ? risk.circulationAddress : null
  return txt(dir?.postalCode)
}

/** Nombre del conductor habitual de la petición (para la casilla); `null` si no se sabe. */
export function conductorHabitualDe(peticion: unknown): string | null {
  const p = personasDe(peticion)
  return p?.conductor_habitual?.nombre ?? null
}

/** ¿Son del mismo vehículo? Sin matrícula en alguna de las dos, NO (no se afirma un cambio). */
export function mismoVehiculo(a: unknown, b: unknown): boolean {
  const ma = matriculaDe(a)
  return ma !== null && ma === matriculaDe(b)
}

/**
 * Qué cambia la variante que se emite respecto a la primera del MISMO vehículo. Vacío = mismas
 * personas y CP, o no se puede comparar (sin matrícula, petición ilegible). Nunca se afirma un
 * cambio de un papel que en un lado no se puede leer.
 */
export function cambiosDePeticion(primera: unknown, esta: unknown): CambioRiesgo[] {
  if (!mismoVehiculo(primera, esta)) return []
  const a = personasDe(primera)
  const b = personasDe(esta)
  if (!a || !b) return []
  const out: CambioRiesgo[] = []
  for (const papel of ['tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional'] as const) {
    const x = a[papel]
    const y = b[papel]
    if (x === undefined || y === undefined) continue
    if ((x?.dni ?? null) === (y?.dni ?? null)) continue
    out.push({ campo: papel, antes: x ? (x.nombre ?? 'otra persona') : null, despues: y ? (y.nombre ?? 'otra persona') : null })
  }
  const cpA = cpDe(primera)
  const cpB = cpDe(esta)
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
