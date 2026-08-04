// ────────────────────────────────────────────────────────────────────────────
// DEUDA DE COMUNIDAD que hereda el adjudicatario (art. 9.1.e LPH). PURO.
//
// Es la partida que más veces se olvida y la única del coste que NO aparece en
// ningún sitio de la subasta: ni el BOE ni la certificación registral dicen lo
// que el ejecutado debe a su comunidad de propietarios. Y se hereda por ley:
//
//   «El adquirente de una vivienda o local en régimen de propiedad horizontal
//    responde con el propio inmueble de las cantidades adeudadas a la comunidad
//    para el sostenimiento de los gastos generales por los propietarios
//    anteriores hasta el límite de los que resulten imputables a la parte
//    vencida de la ANUALIDAD EN CURSO y los TRES AÑOS ANTERIORES.»
//
// Dos matices que cambian el número y que aquí son explícitos:
//   · El tope son 4 anualidades, pero lo REAL suele ser menos: el impago
//     empieza más o menos cuando empieza el procedimiento. Se estima por los
//     años de impago probables, con el tope legal como techo.
//   · Solo aplica en PROPIEDAD HORIZONTAL. Una casa aislada o una finca rústica
//     no tienen comunidad, y meterle una deuda inventada sería peor que no
//     estimar nada.
//
// Todo lo que sale de aquí es una ESTIMACIÓN declarada como tal: la cifra buena
// se la tiene que dar el administrador de la finca (o el juzgado, que es a
// quien se le pregunta en el escrito de consulta).
// ────────────────────────────────────────────────────────────────────────────

import type { TipoBien } from './extraccion.ts'

/** Tope legal del art. 9.1.e LPH: anualidad en curso + 3 anteriores. */
export const ANUALIDADES_MAXIMAS = 4

/**
 * Años de impago que se asumen cuando no se sabe nada. Un procedimiento de
 * ejecución desde el primer impago hasta la subasta rara vez baja de dos años,
 * y quien deja de pagar la hipoteca deja de pagar la comunidad casi a la vez.
 */
export const ANIOS_IMPAGO_ASUMIDOS = 2

/**
 * Cuota de comunidad estimada en €/m² al MES, por tipo de inmueble. Órdenes de
 * magnitud de comunidades corrientes (sin portero, sin piscina): un piso de
 * 90 m² sale sobre 45 €/mes, que es lo normal fuera de urbanizaciones de lujo.
 * Se queda deliberadamente en la banda baja: es preferible quedarse corto en
 * una estimación que inflar el coste y descartar una subasta buena.
 */
export const CUOTA_M2_MES: Partial<Record<TipoBien, number>> = {
  vivienda: 0.5,
  local: 0.35,
  garaje: 0.15,
  trastero: 0.1,
}

/** Cuota mínima mensual: ninguna comunidad cobra 3 € al mes por un trastero. */
export const CUOTA_MINIMA_MES = 12

export interface EntradaComunidad {
  tipoBien?: TipoBien | null
  /** Superficie en m². Sin ella no se puede estimar la cuota. */
  superficie?: number | null
  /** Años de impago si se conocen (del juzgado o del administrador). */
  aniosImpago?: number | null
  /** Cuota mensual REAL si se conoce; manda sobre el baremo. */
  cuotaMensual?: number | null
}

export interface DeudaComunidad {
  /** Importe estimado que hereda el comprador. `null` = no procede o sin datos. */
  importe: number | null
  /** Cuota mensual usada en el cálculo. */
  cuotaMensual: number | null
  /** Años computados (≤ `ANUALIDADES_MAXIMAS`). */
  anios: number
  /** `true` si la cifra sale del baremo y no de un dato real. */
  estimado: boolean
  /** Explicación legible, siempre presente. Va al desglose de coste. */
  nota: string
}

/**
 * ¿Está el inmueble en régimen de propiedad horizontal? Solo entonces hay
 * comunidad de la que heredar deuda. Una parcela, una finca rústica o una nave
 * aislada no; un edificio entero tampoco (es el dueño de todo).
 */
export function tienePropiedadHorizontal(tipo?: TipoBien | null): boolean {
  return tipo === 'vivienda' || tipo === 'local' || tipo === 'garaje' || tipo === 'trastero'
}

/**
 * Estima lo que el comprador va a heredar de deuda con la comunidad.
 *
 * Devuelve `importe: null` —y NUNCA 0— cuando no procede o no hay datos, por la
 * misma razón que en las cargas: un 0 se lee como «no debe nada», y aquí lo
 * honesto es decir «no lo sé».
 */
export function deudaComunidadEstimada(e: EntradaComunidad): DeudaComunidad {
  if (!tienePropiedadHorizontal(e.tipoBien)) {
    return {
      importe: null,
      cuotaMensual: null,
      anios: 0,
      estimado: false,
      nota: 'No consta que el inmueble esté en régimen de propiedad horizontal: no se estima deuda de comunidad.',
    }
  }

  const anios = Math.min(
    ANUALIDADES_MAXIMAS,
    Math.max(1, Math.round(e.aniosImpago ?? ANIOS_IMPAGO_ASUMIDOS)),
  )

  // Cuota real si la hay; si no, baremo por m².
  const real = e.cuotaMensual != null && e.cuotaMensual > 0 ? e.cuotaMensual : null
  let cuota = real
  let estimado = false
  if (cuota == null) {
    const m2 = e.superficie
    const tarifa = CUOTA_M2_MES[e.tipoBien as TipoBien]
    if (m2 == null || !(m2 > 0) || tarifa == null) {
      return {
        importe: null,
        cuotaMensual: null,
        anios,
        estimado: false,
        nota:
          'Sin superficie no se puede estimar la cuota de comunidad. Se hereda la anualidad en curso y las 3 ' +
          'anteriores (art. 9.1.e LPH): pregúntaselo al administrador antes de pujar.',
      }
    }
    cuota = Math.max(CUOTA_MINIMA_MES, redondear(m2 * tarifa))
    estimado = true
  }

  const importe = redondear(cuota * 12 * anios)
  const nota = estimado
    ? `Deuda de comunidad ESTIMADA: ${formatearEur(cuota)}/mes (baremo por m²) × ${anios} ${anios === 1 ? 'año' : 'años'} ` +
      `de impago probable = ${formatearEur(importe)}. Se hereda por el art. 9.1.e LPH hasta la anualidad en curso ` +
      'y las 3 anteriores. Confírmalo con el administrador: es la partida que más sorpresas da.'
    : `Deuda de comunidad: ${formatearEur(cuota)}/mes × ${anios} ${anios === 1 ? 'año' : 'años'} = ${formatearEur(importe)} ` +
      '(art. 9.1.e LPH).'

  return { importe, cuotaMensual: cuota, anios, estimado, nota }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

function formatearEur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}
