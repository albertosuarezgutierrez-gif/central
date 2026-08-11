import type { Direccion } from './types.ts'

// Mediana (robusta a valores atípicos, a diferencia de la media).
function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Volumen relativo (RVOL): volumen de la última sesión ÷ volumen TÍPICO de las `ventana` previas.
// >1 = hoy se negoció más de lo normal; el pico "inusual" suele ponerse en 2.
// Baseline = MEDIANA (no media): el volumen tiene colas gordas (días de earnings/noticias ×5),
// y una media se dispara con un único spike → los días siguientes el rvol saldría artificialmente
// BAJO y marcaría "flojo" señales que no lo son. La mediana ignora ese outlier. (Sobre series
// planas media=mediana, así que el comportamiento habitual no cambia.)
export function rvol(volumenes: number[], ventana = 20): number | null {
  if (volumenes.length < ventana + 1) return null
  const previos = volumenes.slice(-(ventana + 1), -1)   // las `ventana` sesiones ANTES de hoy
  const base = mediana(previos)
  if (base === null || base === 0) return null
  return volumenes[volumenes.length - 1] / base
}

// Tendencia del volumen: media de las `corta` últimas ÷ media de las `larga` previas − 1.
// Positivo = el interés está creciendo; negativo = secándose.
export function tendenciaVolumen(volumenes: number[], corta = 5, larga = 20): number | null {
  if (volumenes.length < corta + larga) return null
  const ult = volumenes.slice(-corta)
  const prev = volumenes.slice(-(corta + larga), -corta)
  const mUlt = ult.reduce((a, b) => a + b, 0) / corta
  const mPrev = prev.reduce((a, b) => a + b, 0) / larga
  if (mPrev === 0) return null
  return mUlt / mPrev - 1
}

// ¿Pico de volumen inusual? (RVOL por encima del umbral).
export function volumenInusual(volumenes: number[], umbral = 2): boolean {
  const r = rvol(volumenes)
  return r !== null && r >= umbral
}

// ¿El volumen ACOMPAÑA al movimiento? Un movimiento direccional con volumen alto es más
// fiable que uno con volumen flojo (probable ruido). Neutral no se evalúa.
export function confirmaVolumen(direccion: Direccion, rvolValor: number | null): 'confirma' | 'normal' | 'flojo' | 'na' {
  if (direccion === 'neutral' || rvolValor === null) return 'na'
  if (rvolValor >= 1.5) return 'confirma'   // convicción real: ≥1,5× el volumen típico (1,15× era casi un día normal)
  if (rvolValor >= 0.9) return 'normal'
  return 'flojo'
}
