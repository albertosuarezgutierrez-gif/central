// ────────────────────────────────────────────────────────────────────────────
// SERIE DE VALORACIÓN PROPIA. PURO.
//
// Las certificaciones registrales llevan un dato que nadie mira: el valor que la
// escritura de hipoteca pactó «a efectos de subasta» (en Belmonte, 47.274,90€ en
// 2009). Es una TASACIÓN BANCARIA real, hecha por un tasador homologado sobre esa
// finca concreta — no un precio de oferta de portal.
//
// Acumulando esos pares (importe, año, zona, m²) se construye una referencia
// propia de €/m² por zona, con dos ventajas sobre los comparables de portales:
// son tasaciones y no aspiraciones, y no dependen de que el portal siga publicando.
//
// La limitación, que se dice y no se disimula: son valores HISTÓRICOS (muchos de
// la burbuja) y hay que actualizarlos. Este módulo NO inventa el índice de
// actualización: recibe el factor por año y lo aplica; quién lo calcula (IPV del
// INE, que ya se ingiere en `mercado_indices`) es cosa de la app.
// ────────────────────────────────────────────────────────────────────────────

/** Una tasación pactada leída de una certificación. */
export interface TasacionPactada {
  zona: string
  anio: number
  importe: number
  /** Superficie construida, para poder pasar a €/m². */
  superficie: number | null
}

export interface ReferenciaZona {
  zona: string
  muestra: number
  /** Mediana de €/m² a valor histórico (sin actualizar). */
  eurM2Historico: number | null
  /** Mediana de €/m² actualizada con los factores por año, si se pasaron. */
  eurM2Actualizado: number | null
  /** Rango de años de la muestra: avisa de si la serie es vieja. */
  anioMin: number
  anioMax: number
}

/** Con menos tasaciones que esto la mediana no dice nada. */
export const MIN_MUESTRA_TASACIONES = 3

function mediana(valores: number[]): number | null {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * Referencia de €/m² por zona a partir de las tasaciones pactadas.
 *
 * `factorPorAnio` traduce un valor de ese año a euros de hoy (p. ej. `{2009: 0.82}`
 * si el mercado está un 18% por debajo del pico). Un año sin factor NO se
 * actualiza y solo cuenta en la serie histórica: es mejor una referencia sin
 * actualizar que una actualizada a ojo.
 */
export function referenciaPorZona(
  tasaciones: TasacionPactada[],
  factorPorAnio: Record<number, number> = {},
  minMuestra = MIN_MUESTRA_TASACIONES,
): ReferenciaZona[] {
  const porZona = new Map<string, TasacionPactada[]>()
  for (const t of tasaciones) {
    if (!t.zona || !(t.importe > 0) || !(t.superficie != null && t.superficie > 0)) continue
    const lista = porZona.get(t.zona) ?? []
    lista.push(t)
    porZona.set(t.zona, lista)
  }

  const out: ReferenciaZona[] = []
  for (const [zona, lista] of porZona) {
    if (lista.length < minMuestra) continue
    const historicos = lista.map((t) => t.importe / t.superficie!)
    const actualizados = lista
      .filter((t) => factorPorAnio[t.anio] != null)
      .map((t) => (t.importe / t.superficie!) * factorPorAnio[t.anio])

    out.push({
      zona,
      muestra: lista.length,
      eurM2Historico: mediana(historicos),
      eurM2Actualizado: actualizados.length >= minMuestra ? mediana(actualizados) : null,
      anioMin: Math.min(...lista.map((t) => t.anio)),
      anioMax: Math.max(...lista.map((t) => t.anio)),
    })
  }

  return out.sort((a, b) => b.muestra - a.muestra)
}
