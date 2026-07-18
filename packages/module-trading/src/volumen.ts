import { sma } from './indicadores.ts'
import type { Direccion } from './types.ts'

// Volumen relativo (RVOL): volumen de la última sesión ÷ media de las `ventana` previas.
// >1 = hoy se negoció más de lo normal; el pico "inusual" suele ponerse en 2.
export function rvol(volumenes: number[], ventana = 20): number | null {
  if (volumenes.length < ventana + 1) return null
  const media = sma(volumenes.slice(0, -1), ventana)   // media SIN incluir hoy
  if (media === null || media === 0) return null
  return volumenes[volumenes.length - 1] / media
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
  if (rvolValor >= 1.15) return 'confirma'
  if (rvolValor >= 0.9) return 'normal'
  return 'flojo'
}
