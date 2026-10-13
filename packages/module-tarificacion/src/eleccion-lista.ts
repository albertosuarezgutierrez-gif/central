// Elegir UNA opción de una lista CERRADA con IA (13/10/2026). PURO: la IA llega INYECTADA (`PreguntarIa`); aquí no hay
// SDK, ni red, ni BD. Primer uso: la versión del vehículo cuando el catálogo de la compañía ofrece varias (Allianz Moto:
// BMW «F 800» → 20 versiones). Pensado para la siguiente lista (población por CP) sin tocar `elegirDeLista`.
//
// Reglas (no negociables):
//  · La IA solo ve el CONTEXTO que se le da (datos del objeto, nunca de personas) y la lista. El payload lo construye
//    una función pura con LISTA BLANCA de campos (`contextoEleccionVersion`): un campo nuevo no se cuela solo.
//  · El `codigo` que devuelve TIENE que ser uno de la lista (comparación exacta en código). Fuera de la lista, nulo,
//    respuesta ilegible o IA que falla → `baja`. Solo `alta` con un código de la lista se puede aplicar.
//  · Nunca «la más parecida»: si dos opciones encajan igual, `baja` y decide una persona.

import type { CandidatoVersion } from './vehiculo.ts'
import type { FormularioAuto } from './formulario-auto.ts'

export type OpcionLista = { codigo: string; etiqueta: string }
export type ConfianzaEleccion = 'alta' | 'baja'
export type EleccionIa = { codigo: string | null; confianza: ConfianzaEleccion; motivo: string }
/** La IA inyectada: (instrucciones de sistema, mensaje) → texto. Puede lanzar (→ `baja`). */
export type PreguntarIa = (system: string, prompt: string) => Promise<string>
/** Valores PLANOS del contexto (sin objetos anidados: lo que se manda se ve entero en el test del payload). */
export type ContextoEleccion = Readonly<Record<string, string | number | null>>
export type PeticionEleccion = { contexto: ContextoEleccion; opciones: readonly OpcionLista[]; instrucciones: string }

const MAX_MOTIVO = 300

const FORMATO_SALIDA = `Devuelve SOLO un objeto JSON, sin texto alrededor:
{"codigo": string | null, "confianza": "alta" | "baja", "motivo": string}
- "codigo": el "codigo" EXACTO de UNA opción de la lista, o null.
- "confianza": "alta" SOLO si el contexto identifica sin duda esa opción y ninguna otra encaja igual de bien.
  Si faltan datos, si dos o más opciones podrían valer o si tienes que suponer algo: "baja" y "codigo": null.
- "motivo": una frase corta (máx. 300 caracteres) con el porqué.`

/** Lo que se manda a la IA (exportado para congelarlo en un test). */
export function mensajesEleccion(p: PeticionEleccion): { system: string; prompt: string } {
  return {
    system: `${p.instrucciones.trim()}\n\n${FORMATO_SALIDA}`,
    prompt: JSON.stringify({ contexto: p.contexto, opciones: p.opciones.map((o) => ({ codigo: o.codigo, etiqueta: o.etiqueta })) }),
  }
}

const baja = (motivo: string): EleccionIa => ({ codigo: null, confianza: 'baja', motivo: motivo.slice(0, MAX_MOTIVO) })

/** Primer objeto JSON del texto (con o sin bloque ```json). `null` = ilegible. */
function leerJson(texto: string): Record<string, unknown> | null {
  const a = texto.indexOf('{')
  const b = texto.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    const v = JSON.parse(texto.slice(a, b + 1)) as unknown
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Valida la salida de la IA contra la lista. Pura. Solo devuelve `alta` con un código que está EXACTAMENTE en la
 * lista (y que no está repetido en ella).
 */
export function validarEleccionIa(salida: string, opciones: readonly OpcionLista[]): EleccionIa {
  const j = leerJson(salida)
  if (!j) return baja('la IA no devolvió un JSON legible')
  const motivo = typeof j.motivo === 'string' && j.motivo.trim() ? j.motivo.trim() : 'sin motivo'
  if (j.confianza !== 'alta') return baja(motivo)
  if (typeof j.codigo !== 'string' || !j.codigo.trim()) return baja(`confianza alta sin código: ${motivo}`)
  const codigo = j.codigo.trim()
  const casan = opciones.filter((o) => o.codigo === codigo)
  if (casan.length !== 1) return baja(casan.length === 0 ? 'la IA devolvió un código que no está en la lista' : 'código repetido en la lista')
  return { codigo, confianza: 'alta', motivo: motivo.slice(0, MAX_MOTIVO) }
}

/**
 * Elige UNA opción de `opciones` con la IA inyectada. Nunca lanza: cualquier fallo (IA caída, timeout, JSON roto,
 * código inventado) es `baja`. Con menos de 2 opciones no pregunta (no hay nada que elegir con IA).
 */
export async function elegirDeLista(p: PeticionEleccion, ia: PreguntarIa): Promise<EleccionIa> {
  if (p.opciones.length < 2) return baja('menos de dos opciones: no hay elección que hacer')
  const { system, prompt } = mensajesEleccion(p)
  let salida: string
  try {
    salida = await ia(system, prompt)
  } catch (e) {
    return baja(`la IA falló: ${e instanceof Error ? e.message : String(e)}`)
  }
  return validarEleccionIa(typeof salida === 'string' ? salida : '', p.opciones)
}

// ─── Caso 1: versión del vehículo ────────────────────────────────────────────

export const INSTRUCCIONES_VERSION_VEHICULO = `Eres un técnico de seguros de automóvil en España. El portal de una compañía ofrece varias VERSIONES de catálogo
para un vehículo y hay que escoger la que corresponde. Recibes el "contexto" (solo datos del vehículo: ramo, marca,
modelo, clase de cilindrada del portal, cilindrada en cc y, si la hay, la descripción del vehículo tal como viene en la
póliza) y la lista de "opciones" con su código y su etiqueta de catálogo.
Elige la opción cuya etiqueta corresponde al vehículo descrito (variante, potencia, cilindrada, carrocería…). Si el
contexto no basta para distinguir entre dos o más opciones, NO elijas: confianza "baja".`

/**
 * Contexto que se manda a la IA para elegir la versión: LISTA BLANCA de datos del VEHÍCULO. Nunca matrícula, CP,
 * conductor, fechas, tomador ni nada de personas (`FormularioAuto` los tiene: aquí no se copian).
 */
export function contextoEleccionVersion(riesgo: Pick<FormularioAuto, 'ramo' | 'seleccionVehiculo'>): ContextoEleccion {
  const s = riesgo.seleccionVehiculo ?? null
  return {
    ramo: riesgo.ramo,
    marca: s?.marca ?? null,
    modelo: s?.modelo ?? null,
    clase: s?.clase ?? null,
    cilindradaCc: s?.cilindradaCc ?? null,
    descripcion: s?.descripcion ?? null,
  }
}

/**
 * Petición para la versión, o `null` si no se puede pedir: menos de 2 opciones, alguna SIN código (la elección
 * automática se aplica por código; sin él decide una persona) o códigos repetidos.
 */
export function peticionEleccionVersion(riesgo: Pick<FormularioAuto, 'ramo' | 'seleccionVehiculo'>, opciones: readonly CandidatoVersion[]): PeticionEleccion | null {
  if (opciones.length < 2) return null
  const conCodigo: OpcionLista[] = []
  for (const o of opciones) {
    if (!o.codigo) return null
    conCodigo.push({ codigo: o.codigo, etiqueta: o.etiqueta })
  }
  if (new Set(conCodigo.map((o) => o.codigo)).size !== conCodigo.length) return null
  return { contexto: contextoEleccionVersion(riesgo), opciones: conCodigo, instrucciones: INSTRUCCIONES_VERSION_VEHICULO }
}
