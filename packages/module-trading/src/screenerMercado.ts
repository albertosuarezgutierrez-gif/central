// Cribado del MERCADO ENTERO por métricas (Financial Datasets `screen_stocks`) → `MetricasFactor`.
//
// Es el ÚNICO pilar de selección que no teníamos gratis: Form 4, 13F y fundamentales ya salen de la
// SEC y de Dataroma sin coste. Lo que este añade es partir de "todas las empresas que cumplen X" en
// vez de partir de una lista que alguien nos dio. Verificado con crédito real el 21/08/2026.
//
// Este módulo NO llama a nadie: recibe las filas tal cual las devuelve el proveedor y las traduce al
// contrato de `factores.ts`. Su trabajo de verdad son las tres trampas de abajo.

import type { MetricasFactor } from './factores.ts'

// Fila cruda del proveedor. Solo vienen los campos por los que se FILTRÓ (más los fijos), así que
// casi todo es opcional: pedir `net_margin` en la salida obliga a poner un filtro sobre `net_margin`.
export type FilaScreener = {
  ticker: string
  currency?: string
  market_cap?: number
  free_cash_flow_yield?: number
  return_on_invested_capital?: number
  net_margin?: number
  debt_to_equity?: number
  revenue_growth?: number
  sector?: string
  industry?: string
}

// 🚨 TRAMPA 1 — ROIC con denominador ≈ 0. El proveedor devolvió ASAN con roic 6,68 (668%) y ATAT con
// 3,45 (345%): no son empresas excepcionales, es capital invertido casi nulo (o negativo) dividiendo.
// Es el «no lo sé disfrazado de valor» del CLAUDE.md: pasa cualquier guarda de NULL y encima DOMINA
// el z-score de calidad, así que un gate `roic >= 0,10` deja entrar justo a los peores. Por encima de
// este umbral el dato NO se cree: se anula (→ `undefined` = neutral), nunca se recorta a un tope
// —recortar seguiría afirmando «calidad altísima», que es la mentira que queremos evitar.
export const ROIC_MAX_CREIBLE = 1.0

export type FilaTraducida = { metricas: MetricasFactor; avisos: string[] }

export function traducirFila(f: FilaScreener): FilaTraducida {
  const avisos: string[] = []

  // 🚨 TRAMPA 2 — divisa. Los yields cruzan una magnitud de la empresa con su capitalización; si la
  // fila no viene en USD, el cociente mezcla monedas y sale un número plausible y falso (la lección
  // del PR #1189). Ante duda, el dato se pierde, no se convierte a ojo.
  const enUsd = f.currency === undefined || f.currency === 'USD'
  if (!enUsd) avisos.push(`divisa ${f.currency}: se anulan los yields (la capitalización es en USD)`)

  let roic = f.return_on_invested_capital
  if (roic !== undefined && Number.isFinite(roic) && Math.abs(roic) > ROIC_MAX_CREIBLE) {
    avisos.push(`roic ${(roic * 100).toFixed(0)}% no es creíble (capital invertido ≈ 0): se anula`)
    roic = undefined
  }

  return {
    metricas: {
      simbolo: f.ticker,
      fcfYield: enUsd ? f.free_cash_flow_yield : undefined,
      roic,
      margenNeto: f.net_margin,
      // `debt_to_equity` NO se mapea a `deudaEbitda`: son ratios distintos y meterlo ahí sería
      // puntuar apalancamiento con un número que no lo mide. Se queda fuera hasta tener deuda/EBITDA.
    },
    avisos,
  }
}

export type Traduccion = {
  metricas: MetricasFactor[]
  avisos: { simbolo: string; aviso: string }[]
  /** true = la respuesta llegó al límite y, como el proveedor ordena ALFABÉTICAMENTE, el resto del
   *  universo quedó invisible (no es que no exista). Ver `truncadaPorLimite`. */
  truncada: boolean
}

// 🚨 TRAMPA 3 — el screener FILTRA, no rankea: devuelve por orden alfabético de ticker. Una petición
// con `limit: 25` no da "los 25 mejores", da los 25 primeros empezando por la A — y no hay parámetro
// de página. Tomar esa lista por un ranking es afirmar que el universo empieza y acaba en la A.
// Con `limit` al máximo (100) hay que trocear la consulta por `sector` (11 valores) o apretar los
// filtros hasta bajar de 100, y el ranking se hace AQUÍ, con `rankearFactores`.
export function truncadaPorLimite(filas: FilaScreener[], limite: number): boolean {
  return filas.length >= limite
}

export function traducirScreener(filas: FilaScreener[], limite: number): Traduccion {
  const metricas: MetricasFactor[] = []
  const avisos: { simbolo: string; aviso: string }[] = []
  for (const f of filas) {
    const t = traducirFila(f)
    metricas.push(t.metricas)
    for (const a of t.avisos) avisos.push({ simbolo: f.ticker, aviso: a })
  }
  return { metricas, avisos, truncada: truncadaPorLimite(filas, limite) }
}
