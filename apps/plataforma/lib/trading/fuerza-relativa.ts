// 💪 FUERZA RELATIVA EN DÍAS DE CAÍDA (idea de Alberto, 20/07/2026): "cuando hay bajada grande y la
// acción no baja tanto o incluso acaba positiva". Correcto — es la lectura clásica de fuerza relativa:
// en los días MALOS del índice, una acción que aguanta (o sube) tiene compradores defendiéndola en cada
// bajada, típicamente institucionales. Complementa al 📊 de volumen: el volumen dice QUE entran, la
// resistencia en caídas dice CUÁNTO la defienden. Medición determinista: días en los que el benchmark
// cae ≥ el umbral, ¿qué hizo la acción? Módulo PURO — contexto, nunca filtro del ranking.

export type FuerzaRelativa = {
  diasCaida: number          // días de caída del benchmark analizados
  medianaAccion: number      // retorno mediano de la acción ESOS días
  medianaBench: number       // retorno mediano del benchmark esos días (la vara)
  pctVerdes: number          // % de esos días en los que la acción acabó EN POSITIVO
  veredicto: 'resiste' | 'acompaña' | 'sufre'
}

export const FR_UMBRAL_CAIDA = -0.005   // día de caída = benchmark cae ≥ 0,5%
export const FR_MIN_DIAS = 8            // con menos muestra el número es anecdótico

function retornos(cierres: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < cierres.length; i++) {
    if (cierres[i - 1] > 0) out.push(cierres[i] / cierres[i - 1] - 1)
  }
  return out
}

const mediana = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Compara los retornos de la acción con los del benchmark EN LOS DÍAS DE CAÍDA del benchmark, sobre
// las últimas `ventana` sesiones comunes (alineadas por el final de ambas series — mismas fuentes y
// mismas sesiones de bolsa de EEUU). Devuelve null sin solape o sin días de caída suficientes.
// Veredicto: 'resiste' = mediana de la acción ≥ 0 en los días malos del índice (lo que describió
// Alberto); 'acompaña' = cae, pero menos que el índice; 'sufre' = cae igual o más.
export function fuerzaRelativaEnCaidas(
  cierresAccion: number[],
  cierresBench: number[],
  ventana = 120,
): FuerzaRelativa | null {
  const ra = retornos(cierresAccion).slice(-ventana)
  const rb = retornos(cierresBench).slice(-ventana)
  const n = Math.min(ra.length, rb.length)
  if (n < 40) return null
  const xa = ra.slice(-n); const xb = rb.slice(-n)
  const accion: number[] = []; const bench: number[] = []
  for (let i = 0; i < n; i++) {
    if (xb[i] <= FR_UMBRAL_CAIDA) { accion.push(xa[i]); bench.push(xb[i]) }
  }
  if (accion.length < FR_MIN_DIAS) return null
  const medianaAccion = mediana(accion)
  const medianaBench = mediana(bench)
  const pctVerdes = accion.filter(r => r > 0).length / accion.length
  const veredicto: FuerzaRelativa['veredicto'] =
    medianaAccion >= 0 ? 'resiste' : medianaAccion > medianaBench ? 'acompaña' : 'sufre'
  return { diasCaida: accion.length, medianaAccion, medianaBench, pctVerdes, veredicto }
}
