// Actualización anual de la renta por índice (LAU art. 18). Función PURA: el índice (variación del IPC, del IRAV
// o del que pacte el contrato) ENTRA COMO PARÁMETRO; aquí no se consulta el INE ni se guarda una tabla de índices.
//
// Reglas:
// - Sin cláusula de actualización en el contrato, la renta NO se actualiza (`sin_clausula`): la LAU solo permite
//   actualizar si se pacta.
// - Se actualiza en cada ANIVERSARIO del contrato (inicio + k años), uno cada vez: el siguiente aniversario
//   posterior a la última actualización aplicada.
// - El índice que llega tiene que ser el del contrato: un IPC no sirve para un contrato que pacta IRAV
//   (`indice_distinto`). Sin índice (`null`) → `sin_indice` («no lo sabemos»), nunca «0 %».
// - `topePct` es el LÍMITE LEGAL vigente que decida quien llama (p. ej. el 2 %/3 % de 2022-2024 o el que fije la
//   norma del momento): se pasa, no se codifica, porque cambia por ley. Una variación NEGATIVA baja la renta.
// - Esto PROPONE: la nueva renta solo es exigible tras notificarla al inquilino; quien aplica es el propietario.

import { esFecha, sumarAnios, sumarDias, type Fecha } from './fechas.ts'
import { finEfectivo, rentaVigente } from './contrato.ts'
import type { Centimos, Contrato, IndiceActualizacion } from './tipos.ts'

export interface VariacionIndice {
  indice: IndiceActualizacion
  /** Variación en % (2,95 → `2.95`). */
  pct: number
  /** Periodo al que se refiere (p. ej. `2026-08`): se enseña y se sella en la propuesta. */
  periodo: string
}

export interface EntradaActualizacion {
  contrato: Contrato
  hoy: Fecha
  variacion: VariacionIndice | null
  /** Límite legal en % a la subida. `null`/ausente = sin límite. */
  topePct?: number | null
  /** Con cuántos días de antelación al aniversario se propone (para notificarla a tiempo). Def. 30. */
  antelacionDias?: number
}

export type ResultadoActualizacion =
  | { estado: 'sin_clausula' }
  | { estado: 'terminado' }
  | { estado: 'no_toca'; proximoAniversario: Fecha }
  | { estado: 'sin_indice'; proximoAniversario: Fecha }
  | { estado: 'indice_distinto'; proximoAniversario: Fecha; esperado: IndiceActualizacion; recibido: IndiceActualizacion }
  | {
      estado: 'propuesta'
      aplicableDesde: Fecha
      rentaActual: Centimos
      rentaNueva: Centimos
      /** % realmente aplicado (con el tope, si lo hubo). */
      pctAplicado: number
      topado: boolean
      indice: IndiceActualizacion
      periodo: string
    }

/** Primer aniversario (inicio + k años, k ≥ 1) estrictamente posterior a `despuesDe`. */
export function aniversarioSiguiente(inicio: Fecha, despuesDe: Fecha): Fecha {
  let k = 1
  let f = sumarAnios(inicio, k)
  while (f <= despuesDe) f = sumarAnios(inicio, ++k)
  return f
}

/** El aniversario que toca actualizar: el siguiente a la última actualización aplicada (o al inicio). */
export function proximoAniversarioActualizacion(c: Contrato): Fecha {
  let ultima: Fecha = c.inicio
  for (const a of c.actualizaciones) if (a.desde > ultima) ultima = a.desde
  return aniversarioSiguiente(c.inicio, ultima)
}

export function calcularActualizacionRenta(e: EntradaActualizacion): ResultadoActualizacion {
  const c = e.contrato
  if (c.clausula.tipo === 'ninguna') return { estado: 'sin_clausula' }
  if (!esFecha(e.hoy)) throw new Error('hoy_invalido')

  const fin = c.terminadoEn ? finEfectivo(c) : null
  if (fin && e.hoy > fin) return { estado: 'terminado' }

  const aniv = proximoAniversarioActualizacion(c)
  const antelacion = e.antelacionDias ?? 30
  if (e.hoy < sumarDias(aniv, -antelacion)) return { estado: 'no_toca', proximoAniversario: aniv }
  // Un contrato terminado antes del aniversario no se actualiza.
  if (fin && fin < aniv) return { estado: 'terminado' }

  const v = e.variacion
  if (!v || typeof v.pct !== 'number' || !Number.isFinite(v.pct)) return { estado: 'sin_indice', proximoAniversario: aniv }
  if (v.indice !== c.clausula.indice) {
    return { estado: 'indice_distinto', proximoAniversario: aniv, esperado: c.clausula.indice, recibido: v.indice }
  }

  // En puntos básicos ENTEROS: 2,95 % = 295 pb. Evita que 2.95 * 100 = 295.00000000000006 mueva un céntimo.
  let pb = Math.round(v.pct * 100)
  let topado = false
  if (typeof e.topePct === 'number' && Number.isFinite(e.topePct)) {
    const topePb = Math.round(e.topePct * 100)
    if (pb > topePb) {
      pb = topePb
      topado = true
    }
  }
  const rentaActual = rentaVigente(c, sumarDias(aniv, -1))
  const rentaNueva = Math.round((rentaActual * (10_000 + pb)) / 10_000)
  return {
    estado: 'propuesta',
    aplicableDesde: aniv,
    rentaActual,
    rentaNueva,
    pctAplicado: pb / 100,
    topado,
    indice: v.indice,
    periodo: v.periodo,
  }
}
