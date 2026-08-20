// ────────────────────────────────────────────────────────────────────────────
// Del remate REAL al número que decide la puja. PURO.
//
// `calibracionAdjudicaciones` ya sabía a qué % del tipo se remata de verdad en
// cada provincia… y no lo usaba nadie para decidir: pintaba una frase en la
// pantalla y el techo de puja seguía saliendo de la teoría (valor de mercado
// estimado − 25%). Aquí se cierra el bucle: la muestra real se convierte en
// EUROS esperados de remate, y con eso se revisa si nuestro techo tiene algún
// sentido antes de enseñarlo como si fuera una recomendación.
//
// Dos verdades de la muestra de agosto de 2026 que este módulo respeta:
//   · El tipo de salida NO es el valor de mercado. Fuera del centro se remató
//     al 44-76% del tipo; en el centro de Sevilla, a 2x y 4x. Por eso el ratio
//     es MEDIANO (no media) y se etiqueta siempre con su muestra.
//   · Un techo por encima del propio tipo, calculado sobre un valor de mercado
//     que es la mediana del municipio, no es un techo: es un error con forma de
//     número (Dos Hermanas: tipo 739.210,43€, techo «calculado» 887.052,43€).
//
// Sin muestra suficiente no se estima nada: `null` y se dice que faltan casos.
// ────────────────────────────────────────────────────────────────────────────

import type { CalibracionZona } from './adjudicaciones.ts'

/** Remates conocidos que hacen falta para atreverse a esperar una cifra. */
export const MIN_MUESTRA_REMATE = 3

export interface RemateEsperado {
  /** Euros esperados de remate. `null` = sin muestra suficiente (no se inventa). */
  importe: number | null
  /** Ratio mediano remate/tipo aplicado. `null` cuando no hay importe. */
  ratio: number | null
  /** De dónde sale el ratio: su provincia, el agregado, o nada todavía. */
  base: 'provincia' | 'global' | null
  /** Cuántos remates reales sostienen el ratio. */
  muestra: number
  /** Frase para la ficha y el aviso; SIEMPRE dice de cuántos casos sale. */
  lectura: string
}

const SIN_MUESTRA = (muestra: number): RemateEsperado => ({
  importe: null,
  ratio: null,
  base: null,
  muestra,
  lectura:
    muestra > 0
      ? `Aún no hay remates suficientes para estimar (${muestra} de ${MIN_MUESTRA_REMATE}): el tipo de salida no dice lo que se pagará.`
      : 'Todavía no hemos visto ningún remate con el que comparar: el tipo de salida no dice lo que se pagará.',
})

/**
 * Euros que cabe esperar de remate para una subasta viva, a partir de lo que se
 * ha rematado DE VERDAD. Prefiere la muestra de su provincia y cae al agregado
 * global solo si la provincia no llega al mínimo.
 */
export function remateEsperado(
  valorSubasta: number | null,
  provincia: string | null,
  calibracion: CalibracionZona[],
  minMuestra = MIN_MUESTRA_REMATE,
): RemateEsperado {
  const util = (z: CalibracionZona | undefined) =>
    z != null && z.ratioMediano != null && z.ratioMediano > 0 && z.muestraRatio >= minMuestra ? z : undefined

  const prov = (provincia ?? '').trim().toLowerCase()
  const zona = util(calibracion.find((z) => z.provincia.trim().toLowerCase() === prov && prov !== ''))
  const global = util(calibracion.find((z) => z.provincia === '(todas)'))
  const elegida = zona ?? global
  const base: RemateEsperado['base'] = zona ? 'provincia' : global ? 'global' : null

  if (!elegida || base == null) {
    const vistos = calibracion.find((z) => z.provincia === '(todas)')?.muestraRatio ?? 0
    return SIN_MUESTRA(vistos)
  }
  if (valorSubasta == null || valorSubasta <= 0) {
    return {
      importe: null,
      ratio: elegida.ratioMediano,
      base,
      muestra: elegida.muestraRatio,
      lectura: `Sin tipo de salida publicado no se puede proyectar el remate (${porcentaje(elegida.ratioMediano!)} de mediana en ${etiqueta(base, elegida)}).`,
    }
  }

  const importe = valorSubasta * elegida.ratioMediano!
  return {
    importe,
    ratio: elegida.ratioMediano,
    base,
    muestra: elegida.muestraRatio,
    lectura:
      `En ${etiqueta(base, elegida)} se remata de mediana al ${porcentaje(elegida.ratioMediano!)} del tipo ` +
      `(${elegida.muestraRatio} ${elegida.muestraRatio === 1 ? 'remate real' : 'remates reales'}): con este tipo, ` +
      `esperable ~${eur(importe)}.`,
  }
}

export interface RevisionTecho {
  /** `false` = no enseñar `puja_maxima_calc` como si fuera una recomendación. */
  fiable: boolean
  /** Por qué no es de fiar. `null` cuando lo es. */
  motivo: string | null
  /** Aviso para la ficha/Telegram; `null` cuando no hay nada que decir. */
  aviso: string | null
}

/**
 * Contrasta el techo de puja calculado (teoría) con el tipo de salida y con el
 * remate esperado (realidad). No corrige el número: decide si se puede enseñar
 * y qué hay que decir junto a él.
 */
export function revisarTecho(args: {
  /** `puja_maxima_calc`: el techo para el descuento objetivo. */
  techo: number | null
  valorSubasta: number | null
  /** El valor de mercado usado era la mediana de la zona, no del inmueble. */
  valorOrientativo: boolean
  remate: RemateEsperado
}): RevisionTecho {
  const { techo, valorSubasta, valorOrientativo, remate } = args

  if (techo == null || techo <= 0) {
    return {
      fiable: false,
      motivo: 'No hay valor de mercado con el que calcular un techo de puja.',
      aviso: remate.importe != null ? `Sin techo propio; ${minuscula(remate.lectura)}` : null,
    }
  }

  // El error que destapó la muestra real: un techo POR ENCIMA del tipo salido de
  // una mediana municipal. No es un techo agresivo, es un número sin fundamento.
  if (valorSubasta != null && valorSubasta > 0 && techo > valorSubasta && valorOrientativo) {
    return {
      fiable: false,
      motivo:
        `El techo (${eur(techo)}) sale por encima del propio tipo de salida (${eur(valorSubasta)}) y el valor de ` +
        'mercado es la mediana de la zona, no de este inmueble: no sirve para decidir una puja.',
      aviso: `⚠️ Techo no fiable: ${eur(techo)} supera el tipo (${eur(valorSubasta)}) con un valor de mercado orientativo.`,
    }
  }

  if (remate.importe == null) return { fiable: true, motivo: null, aviso: remate.lectura }

  // Realidad contra techo: no invalida el número, pero dice si vas a competir.
  const aviso =
    techo < remate.importe
      ? `⚖️ Con tu techo de ${eur(techo)} probablemente NO ganes: ${minuscula(remate.lectura)}`
      : `⚖️ Tu techo de ${eur(techo)} queda por encima del remate esperado: ${minuscula(remate.lectura)}`

  return { fiable: true, motivo: null, aviso }
}

function etiqueta(base: 'provincia' | 'global', zona: CalibracionZona): string {
  return base === 'provincia' ? zona.provincia : 'el conjunto de lo que llevamos visto'
}

function minuscula(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function porcentaje(x: number): string {
  return `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 0 })}%`
}

function eur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}
