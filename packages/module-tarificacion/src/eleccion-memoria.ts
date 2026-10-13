// MEMORIA de elecciones de lista (13/10/2026). PURO: sin BD ni red. El bot aprende qué versión de catálogo corresponde a
// un vehículo (por compañía y ramo) para preguntar a la IA cada vez menos.
//
// Reglas (no negociables):
//  · La CLAVE sale SOLO del contexto de lista blanca (`contextoEleccionVersion`): marca, modelo, clase, cilindrada y
//    descripción del VEHÍCULO, normalizados. Nunca matrícula, CP, conductor ni nada de personas (test congelado).
//  · Lo que recuerda la memoria NO se aplica a ciegas: su código tiene que estar EXACTAMENTE una vez en la lista que
//    ofrece HOY el portal (`eleccionDeMemoria`). Si el catálogo cambió, la memoria se ignora y se pregunta a la IA.
//  · Lo elegido por una PERSONA gana a lo elegido por la IA (`fusionarMemoria`).

import type { ContextoEleccion, OpcionLista } from './eleccion-lista.ts'

export type OrigenMemoria = 'ia' | 'humano'
export type EntradaMemoria = { codigo: string; etiqueta: string; origen: OrigenMemoria; confirmaciones: number }

const SEPARADOR = '|'

/** Mayúsculas, sin tildes ni diacríticos, sin el separador de la clave y con los espacios colapsados. */
export function normalizarParteClave(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replaceAll(SEPARADOR, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clave de memoria de la VERSIÓN del vehículo: `MARCA|MODELO|CLASE|CC|DESCRIPCION` normalizados. Lee SOLO esos cinco
 * campos del contexto (el ramo va en su propia columna). Sin marca o sin modelo → `null` (demasiado genérico para
 * recordar nada).
 */
export function claveMemoriaVersion(contexto: ContextoEleccion): string | null {
  const marca = normalizarParteClave(contexto.marca)
  const modelo = normalizarParteClave(contexto.modelo)
  if (!marca || !modelo) return null
  return [marca, modelo, normalizarParteClave(contexto.clase), normalizarParteClave(contexto.cilindradaCc), normalizarParteClave(contexto.descripcion)].join(SEPARADOR)
}

/**
 * ¿Se puede usar lo recordado con la lista de HOY? Solo si su código está EXACTAMENTE una vez. Devuelve la opción DE LA
 * LISTA (su etiqueta de catálogo, no la recordada). Cualquier otra cosa → `null` (se pregunta a la IA).
 */
export function eleccionDeMemoria(memoria: Pick<EntradaMemoria, 'codigo'> | null, opciones: readonly OpcionLista[]): OpcionLista | null {
  if (!memoria || typeof memoria.codigo !== 'string' || !memoria.codigo) return null
  const casan = opciones.filter((o) => o.codigo === memoria.codigo)
  return casan.length === 1 ? { codigo: casan[0].codigo, etiqueta: casan[0].etiqueta } : null
}

/**
 * Cómo queda la entrada al recibir una elección nueva (confirmada). `null` = no se toca.
 *  · Sin entrada → nace con 1 confirmación.
 *  · Mismo código → +1 confirmación (y si la nueva es humana, pasa a `humano`).
 *  · Código distinto: la humana sustituye (1 confirmación); la de la IA NO pisa una humana; IA sobre IA sustituye.
 */
export function fusionarMemoria(existente: EntradaMemoria | null, nueva: { codigo: string; etiqueta: string; origen: OrigenMemoria }): EntradaMemoria | null {
  if (!existente) return { ...nueva, confirmaciones: 1 }
  if (existente.codigo === nueva.codigo) {
    return { codigo: nueva.codigo, etiqueta: nueva.etiqueta, origen: existente.origen === 'humano' || nueva.origen === 'humano' ? 'humano' : 'ia', confirmaciones: existente.confirmaciones + 1 }
  }
  if (existente.origen === 'humano' && nueva.origen === 'ia') return null
  return { ...nueva, confirmaciones: 1 }
}
