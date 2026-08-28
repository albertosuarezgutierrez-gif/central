import type { PuntoContraste } from './precios-guardia'

// Retorno del BENCHMARK (SPY) entre dos fechas, para poder medir el ALFA de cada tesis en vez de su
// retorno absoluto (hipótesis H13 del pre-registro, 28/08/2026). Módulo PURO y testeado.
//
// Por qué existe: `puntuarTesis` mide `(precioDespues − precioRef) / precioRef`, y `acierto` de una
// alcista es simplemente «subió». En un tramo alcista eso lo hace el MERCADO, no la estrategia — y ese
// hit-rate es justo lo que `ajustesDeStats` convierte en delta de confianza del torneo. El módulo ya
// tenía toda la maquinaria de benchmark (`seleccionEval`, `universo`, `riesgoCesta`), pero solo la
// usaban las cestas: el track record por estrategia nunca restó el índice.
//
// 🚨 El benchmark se lee de la MISMA fuente (Stooq→Yahoo, `cierresDeContraste`) para los dos extremos:
// mezclar el cierre de IBKR de la sesión con el de Stooq de hoy metería en el alfa la diferencia entre
// dos fuentes, que no es alfa de nadie. Y ante cualquier hueco se devuelve NULL: un alfa que no se ha
// podido medir NO es un alfa de cero.

// Último cierre publicado con fecha <= la pedida, junto CON SU FECHA (las fechas de tesis caen en
// festivos y fines de semana). Mismo criterio que `precioEn` del retrovisor, para que las dos medidas
// sean comparables. Devolver la fecha es lo que permite comprobar cuánto se ha estirado la ventana.
export function cierreEn(serie: PuntoContraste[], fecha: string): PuntoContraste | null {
  let out: PuntoContraste | null = null
  for (const p of serie) {
    if (p.fecha > fecha) break
    out = p
  }
  return out
}

// Días naturales de holgura que se admiten entre la fecha pedida y la del cierre que realmente se usa.
// Cuatro cubren un puente largo. Más allá, la ventana del índice ya no es la de la tesis y medir el
// «alfa» sería restar dos periodos distintos — un número plausible que no significa nada, que es el
// fallo más caro que documenta el CLAUDE.md. La fuente del contraste va a veces un día por detrás
// (`desfasados` en `precios-contraste.ts`), así que esto pasa de verdad.
export const TOLERANCIA_BENCH_DIAS = 4

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

// `null` si falta cualquiera de los dos extremos, si el precio de partida no es positivo, o si el
// cierre disponible se aleja más de `TOLERANCIA_BENCH_DIAS` de la fecha pedida. Un alfa que no se ha
// podido medir NO es un alfa de cero, y una ventana distinta a la de la tesis no es su alfa.
export function retornoBench(
  serie: PuntoContraste[] | undefined,
  desde: string,
  hasta: string,
  toleranciaDias = TOLERANCIA_BENCH_DIAS,
): number | null {
  if (!serie?.length || desde > hasta) return null
  const a = cierreEn(serie, desde)
  const b = cierreEn(serie, hasta)
  if (a == null || b == null || !(a.cierre > 0)) return null
  if (diasEntre(a.fecha, desde) > toleranciaDias) return null
  if (diasEntre(b.fecha, hasta) > toleranciaDias) return null
  return b.cierre / a.cierre - 1
}

// Nombre del índice de referencia. Es el MISMO que usan el retrovisor (`trading_backtest` siembra SPY)
// y el régimen de mercado, para que «batir al mercado» signifique lo mismo en todo el sistema.
export const SIMBOLO_BENCH = 'SPY'
