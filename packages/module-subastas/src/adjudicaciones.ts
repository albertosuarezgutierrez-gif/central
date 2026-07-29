// ────────────────────────────────────────────────────────────────────────────
// Calibración del scoring con RESULTADOS reales de subastas concluidas. PURO.
//
// El BOE publica el resultado de cada subasta (adjudicada/desierta y el importe
// de adjudicación); `capturarResultados` lo guarda. Con muestra suficiente, la
// mediana de `importe_adjudicacion / valor_subasta` por provincia dice a qué %
// del tipo se adjudica DE VERDAD — realidad contra la teoría del scoring.
// Sin muestra, no se dice nada (nunca se inventa).
// ────────────────────────────────────────────────────────────────────────────

/** Fila de una subasta concluida, tal cual sale de la BD. */
export interface ResultadoConcluido {
  provincia: string | null
  valorSubasta: number | null
  importeAdjudicacion: number | null
  /** Texto del resultado capturado de la ficha («adjudicada», «desierta»…). */
  resultado: string | null
}

export interface CalibracionZona {
  /** Provincia, o `(todas)` para el agregado global. */
  provincia: string
  /** Concluidas con resultado conocido. */
  muestra: number
  adjudicadas: number
  desiertas: number
  /** Mediana de importe/valor de las adjudicadas con ambas cifras. `null` sin datos. */
  ratioMediano: number | null
  /** Cuántas adjudicadas aportan al ratio (tienen importe y valor > 0). */
  muestraRatio: number
}

/** Muestra mínima por provincia para publicar su calibración. */
export const MIN_MUESTRA_CALIBRACION = 3

function mediana(valores: number[]): number | null {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * Calibración por provincia + agregado global a partir de los resultados
 * capturados. Solo salen provincias con `minMuestra` concluidas; el agregado
 * `(todas)` sale siempre que haya al menos una.
 */
export function calibracionAdjudicaciones(
  filas: ResultadoConcluido[],
  minMuestra = MIN_MUESTRA_CALIBRACION,
): CalibracionZona[] {
  const conResultado = filas.filter((f) => f.resultado != null && f.resultado.trim() !== '')
  if (!conResultado.length) return []

  const grupos = new Map<string, ResultadoConcluido[]>()
  for (const f of conResultado) {
    const clave = (f.provincia ?? '').trim()
    if (!clave) continue
    const g = grupos.get(clave) ?? []
    g.push(f)
    grupos.set(clave, g)
  }

  const calibrar = (provincia: string, g: ResultadoConcluido[]): CalibracionZona => {
    const adjudicadas = g.filter((f) => /adjudicad/i.test(f.resultado!))
    const ratios = adjudicadas
      .filter((f) => (f.importeAdjudicacion ?? 0) > 0 && (f.valorSubasta ?? 0) > 0)
      .map((f) => f.importeAdjudicacion! / f.valorSubasta!)
    return {
      provincia,
      muestra: g.length,
      adjudicadas: adjudicadas.length,
      desiertas: g.filter((f) => /desiert/i.test(f.resultado!)).length,
      ratioMediano: mediana(ratios),
      muestraRatio: ratios.length,
    }
  }

  const out = [...grupos.entries()]
    .filter(([, g]) => g.length >= minMuestra)
    .map(([prov, g]) => calibrar(prov, g))
    .sort((a, b) => b.muestra - a.muestra)
  out.push(calibrar('(todas)', conResultado))
  return out
}
