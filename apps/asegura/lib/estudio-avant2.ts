// El ESTUDIO de un presupuesto de Avant2 (21/10/2026, opción B). PURO: sin BD, sin red, sin IA.
//
// Hasta hoy un presupuesto de origen `codeoscopic` salía por `pdfPresupuesto` SIN cuadro comparativo, sin resumen y
// sin etiqueta IA: solo el estudio de ofertas (`prepararPresupuestoDeOfertas`) los llevaba. Ahora el de Avant2 congela
// también su `estudio` con la MISMA lógica y la MISMA huella que la comparativa de la oportunidad:
//   · los precios EN DOCUMENTO (no ocultos y con prima) de la tarificación ya pagada;
//   · por compañía y nivel, el más barato de periodo anual (`seleccionarAvant2`), hasta `MAX_AVANT2_EN_CUADRO`;
//   · más la póliza actual de la cartera si la hay (la pone quien llama, con `primaConRecibos`);
//   → `compararOfertas` (el ÚNICO motor) + `huellaComparativa`.
// 🚨 NO cambia la emisión: aceptar sigue emitiendo por Avant2 EXACTAMENTE el precio pulsado (`encontrarPrecio`). El
//    estudio solo se pinta.

import { compararOfertas, ofertaDeAvant2, ramoOfertaDe, seleccionarAvant2, type OfertaNormalizada, type PrecioAvant2, type ResultadoComparacion } from '@central/module-seguros'
import { huellaComparativa } from './comparativa-huella.ts'

/** Columnas de Avant2 en el cuadro (las 24 de una tarificación no se leen). Lo usa también la comparativa de la oportunidad. */
export const MAX_AVANT2_EN_CUADRO = 6

/** Las garantías clasificadas tal como se guardan (`{version, porClave}`), validadas por forma. `null` = sin leer. */
export function garantiasAvant2De(v: unknown): PrecioAvant2['garantias'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const pc = (v as { porClave?: unknown }).porClave
  if (!pc || typeof pc !== 'object' || Array.isArray(pc)) return null
  const porClave: Record<string, 'si' | 'no' | 'no_consta'> = {}
  for (const [k, e] of Object.entries(pc as Record<string, unknown>)) if (e === 'si' || e === 'no' || e === 'no_consta') porClave[k] = e
  return { porClave }
}

/** `portada` = es una de las RECOMENDADAS del presupuesto: entra SIEMPRE al cuadro (aunque pase del máximo). */
export type PrecioEnPresupuesto = PrecioAvant2 & { oculta: boolean; portada?: boolean }

export type EstudioAvant2 = {
  comparacion: ResultadoComparacion
  /** Misma huella que `comparativa-guardada` (versión del motor, ramo, ofertas, recomendada `null`). */
  huella: string
  /** Los precios que entraron al cuadro (ids de `tarificacion_precios`). */
  enCuadro: string[]
  actualId: string | null
}

/**
 * La comparación de un presupuesto de Avant2. `null` = no hay ningún precio en documento con prima: no hay cuadro que
 * enseñar (el presupuesto sale igual, sin él). Lo oculto por el corredor NUNCA entra (el cliente no lo ve).
 */
export function estudioDePresupuestoAvant2(input: {
  ramo: string
  precios: readonly PrecioEnPresupuesto[]
  actual: OfertaNormalizada | null
  caducada?: boolean
}): EstudioAvant2 | null {
  const ramo = ramoOfertaDe(input.ramo)
  const visibles = input.precios.filter((p) => !p.oculta && typeof p.primaEur === 'number' && Number.isFinite(p.primaEur) && p.primaEur > 0)
  if (visibles.length === 0) return null
  // Las recomendadas primero y siempre; el resto de columnas, las más baratas por compañía y nivel.
  const portada = visibles.filter((p) => p.portada === true)
  const resto = seleccionarAvant2(visibles.filter((p) => p.portada !== true), Math.max(0, MAX_AVANT2_EN_CUADRO - portada.length))
  const elegidos = [...portada, ...resto]
  const ofertas = [
    ...(input.actual ? [input.actual] : []),
    ...elegidos.map((p) => ofertaDeAvant2(p, ramo, { caducada: input.caducada === true })),
  ]
  const comparacion = compararOfertas({ ramo, ofertas, superficieM2: null })
  return {
    comparacion,
    huella: huellaComparativa({ ramo, ofertas: comparacion.ofertas, superficieM2: null, recomendadaId: null }),
    enCuadro: elegidos.map((p) => p.id),
    actualId: input.actual?.id ?? null,
  }
}
