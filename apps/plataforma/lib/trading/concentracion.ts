// ⚖️ CONCENTRACIÓN del top del radar (idea 20/07/2026, con el superciclo de memoria en marcha): si
// medio top-10 es la MISMA apuesta (BE/LITE/WDC/MU…), la diversificación de la cesta es ilusoria —
// cuando la burbuja pinche caerán JUNTOS. En vez de etiquetas de sector (los SIC parten el tema
// memoria en varios códigos), se mide lo que importa de verdad: la CORRELACIÓN media de los retornos
// diarios entre los valores del top. Correlación alta = un solo motor mueve la cesta. Es CONTEXTO en
// el digest, no filtro. Módulo PURO — la serie de cierres ya la baja el ranking para el técnico.

export const CORRELACION_RETORNOS_MIN = 30   // mínimo de retornos comunes para que el número signifique algo
export const CORRELACION_SERIES_MIN = 4      // con menos de 4 valores la media de pares es anecdótica

function retornos(cierres: number[], n: number): number[] {
  const tail = cierres.slice(-(n + 1))
  const out: number[] = []
  for (let i = 1; i < tail.length; i++) {
    if (tail[i - 1] > 0) out.push(tail[i] / tail[i - 1] - 1)
  }
  return out
}

function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n < CORRELACION_RETORNOS_MIN) return null
  const xa = a.slice(-n); const xb = b.slice(-n)
  const ma = xa.reduce((s, v) => s + v, 0) / n
  const mb = xb.reduce((s, v) => s + v, 0) / n
  let num = 0; let da = 0; let db = 0
  for (let i = 0; i < n; i++) {
    num += (xa[i] - ma) * (xb[i] - mb)
    da += (xa[i] - ma) ** 2
    db += (xb[i] - mb) ** 2
  }
  const den = Math.sqrt(da * db)
  return den > 0 ? num / den : null
}

// Correlación MEDIA de todos los pares de la cesta sobre los últimos `ventana` retornos diarios.
// null si no hay series/solape suficientes (mejor callar que dar un número sin base).
export function correlacionMediaCesta(seriesCierres: number[][], ventana = 60): number | null {
  const series = seriesCierres.map(c => retornos(c, ventana)).filter(r => r.length >= CORRELACION_RETORNOS_MIN)
  if (series.length < CORRELACION_SERIES_MIN) return null
  let suma = 0; let pares = 0
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const r = pearson(series[i], series[j])
      if (r != null) { suma += r; pares++ }
    }
  }
  return pares > 0 ? suma / pares : null
}

// Etiqueta legible para el digest (umbrales clásicos de cestas equiponderadas).
export function etiquetaConcentracion(corr: number): string {
  return corr >= 0.7 ? '🔴 alta — el top se mueve como UNA sola apuesta'
    : corr >= 0.5 ? '🟡 media — hay un tema dominante'
    : '🟢 baja — cesta razonablemente diversificada'
}
