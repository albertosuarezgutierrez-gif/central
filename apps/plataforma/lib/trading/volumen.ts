// 📊 Señal de ACUMULACIÓN/DISTRIBUCIÓN institucional por picos de volumen (idea de Alberto,
// 20/07/2026): los fondos no pueden esconder el volumen — cuando acumulan una posición dejan días
// de SUBIDA con volumen anormalmente alto, y cuando distribuyen (sueltan papel) días de BAJADA con
// el mismo patrón. Es la lectura clásica de O'Neil/CANSLIM, medida de forma DETERMINISTA: un "pico"
// es una sesión con volumen ≥ 1,5× su media de 50 sesiones previas; se cuentan los picos al alza y
// a la baja de las últimas 20 sesiones y el neto da el veredicto. OJO estatus: es CONTEXTO en el
// digest/UI, NUNCA filtro ni peso del ranking (misma regla que medias/8-K/premarket; cualquier
// promoción a factor requeriría hipótesis pre-registrada). Módulo PURO — testeable con node --test.
import type { PuntoVol } from './precios-stooq'

export type VeredictoVolumen = 'acumulacion' | 'distribucion' | 'neutral'
export type SenalVolumen = { spikesUp: number; spikesDown: number; veredicto: VeredictoVolumen }

export const VOL_SPIKE_FACTOR = 1.5   // pico = volumen ≥ 1,5× la media previa
export const VOL_MEDIA_SESIONES = 50  // media móvil del volumen "normal"
export const VOL_VENTANA = 20         // ventana reciente donde se cuentan los picos
export const VOL_NETO_MIN = 2         // |picos al alza − a la baja| mínimo para no ser neutral

// Cuenta los picos de volumen de las últimas VOL_VENTANA sesiones contra la media de las
// VOL_MEDIA_SESIONES previas a cada una. El sentido lo da el cierre vs el cierre anterior
// (subida = compran, bajada = venden); los días planos no puntúan. Devuelve null si la serie
// no da para la media + la ventana (o no trae volumen — índices/series rotas).
export function acumulacionDistribucion(puntos: PuntoVol[]): SenalVolumen | null {
  const serie = puntos.filter(p => p.volumen != null && p.volumen > 0)
  if (serie.length < VOL_MEDIA_SESIONES + VOL_VENTANA) return null
  let spikesUp = 0; let spikesDown = 0
  for (let i = serie.length - VOL_VENTANA; i < serie.length; i++) {
    let suma = 0
    for (let j = i - VOL_MEDIA_SESIONES; j < i; j++) suma += serie[j].volumen!
    const media = suma / VOL_MEDIA_SESIONES
    if (media <= 0 || serie[i].volumen! < media * VOL_SPIKE_FACTOR) continue
    const delta = serie[i].cierre - serie[i - 1].cierre
    if (delta > 0) spikesUp++
    else if (delta < 0) spikesDown++
  }
  const neto = spikesUp - spikesDown
  const veredicto: VeredictoVolumen = neto >= VOL_NETO_MIN ? 'acumulacion' : neto <= -VOL_NETO_MIN ? 'distribucion' : 'neutral'
  return { spikesUp, spikesDown, veredicto }
}
