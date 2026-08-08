// RADAR del universo EEUU (Fase 1): rankea las ~500 mayores por el modelo de factores YA existente
// (value+quality+momentum) y añade las capas informativas del spec — etiqueta de calidad por pick,
// diff semanal (entra/sale) y track record de snapshots pasados. La SELECCIÓN decide el QUÉ; el
// técnico (capa del consumidor) solo confirma el CUÁNDO. Puro y serializable.
import { rankearFactores, type MetricasFactor } from './factores.ts'

export type EmpresaUniverso = {
  simbolo: string
  nombre?: string
  piotroski?: number | null
  roic?: number | null
  earningsYield?: number | null
  fcfYield?: number | null     // (CFO − capex)/mktCap — cableado el 19/07/2026 por la hipótesis H4
  momentum?: number | null     //   pre-registrada (spread mejor que el EY + mejor freno anti-batacazo)
  mktCap?: number | null
  guruScore?: number           // convicción Dataroma (0 = sin señal)
  datosFrescos?: boolean       // false = la caché está rancia (lo decide el consumidor)
}

export type ItemRadar = {
  simbolo: string
  nombre?: string
  score: number
  zValor: number
  zCalidad: number
  zMomentum: number
  piotroski?: number | null
  roic?: number | null
  guru: boolean
  etiqueta: 'fuerte' | 'media' | 'debil'
}

export type ResultadoRadar = {
  items: ItemRadar[]      // top N, mejor primero
  universoTotal: number
  conDatos: number        // elegibles (núcleo de calidad + al menos un dato de valor)
  sinValor: number        // descartadas por no tener NI earningsYield NI fcfYield (ver abajo)
}

// Etiqueta de calidad POR PICK (idea A del spec). Regla determinista:
// débil = datos incompletos o rancios (no te fíes) · fuerte = calidad alta (Piotroski≥7, ROIC≥15%)
// + una confirmación (gurús comprando o momentum positivo) · media = el resto.
export function etiquetaCalidad(e: EmpresaUniverso): 'fuerte' | 'media' | 'debil' {
  const completos = e.piotroski != null && e.roic != null && e.earningsYield != null && e.momentum != null && e.mktCap != null
  if (!completos || e.datosFrescos === false) return 'debil'
  const calidadAlta = (e.piotroski ?? 0) >= 7 && (e.roic ?? 0) >= 0.15
  const confirmacion = (e.guruScore ?? 0) > 0 || (e.momentum ?? 0) > 0
  return calidadAlta && confirmacion ? 'fuerte' : 'media'
}

// Rankea el universo con el modelo de factores. Son elegibles los nombres con el núcleo de calidad
// (piotroski + roic) Y al menos un dato del pilar de VALOR; el resto cuenta como "sin datos" (va a la
// línea de salud, no al ranking).
//
// 🚨 LANDMINE (08/08/2026) — por qué el pilar de valor entró en la puerta. El scoring es de z-scores y
// `zscores()` documenta que "un dato ausente = 0 (neutral), nunca penaliza ni premia por faltar". En un
// z-score eso NO es neutral: **0 es la MEDIA del universo**. Una empresa sin earningsYield ni fcfYield
// recibía zValor = 0 = «tan barata como la media», y con el 40% del peso eso es un regalo, no una
// abstención. Medido el 08/08/2026 sobre la caché viva: 161 de 875 elegibles no tenían NINGÚN dato de
// valor (casi todas ADR/extranjeras cuya capitalización no se puede cruzar con el XBRL) y **3 de ellas
// estaban en el top-20** (TSEM, NBIS, ASX); el 58,4% de las que SÍ tienen el dato salían con zValor
// negativo, así que no saber si eras cara te ponía por delante de más de la mitad del universo.
// Es la misma regla de siempre: un «no lo sé» no puede convertirse en una afirmación que decide.
// Alcance deliberado: se exige UNO de los dos (EY o FCFY), no los dos — pedir ambos echaría a 249
// nombres por un capex ausente, que es otra ausencia distinta y ya la absorbe el promedio del pilar.
export function rankearUniverso(empresas: EmpresaUniverso[], opts: { top?: number } = {}): ResultadoRadar {
  const top = opts.top ?? 20
  const conNucleo = empresas.filter(e => e.piotroski != null && e.roic != null)
  const tieneValor = (e: EmpresaUniverso) => e.earningsYield != null || e.fcfYield != null
  const elegibles = conNucleo.filter(tieneValor)
  const sinValor = conNucleo.length - elegibles.length
  const metricas: MetricasFactor[] = elegibles.map(e => ({
    simbolo: e.simbolo,
    earningsYield: e.earningsYield ?? undefined,
    fcfYield: e.fcfYield ?? undefined,
    roic: e.roic ?? undefined,
    piotroski: e.piotroski ?? undefined,
    momentum12m: e.momentum ?? undefined,
  }))
  const scores = rankearFactores(metricas)   // ya ordena mejor primero
  const por = new Map(elegibles.map(e => [e.simbolo, e]))
  const items: ItemRadar[] = scores.slice(0, top).map(s => {
    const e = por.get(s.simbolo)!
    return {
      simbolo: s.simbolo, nombre: e.nombre, score: s.score,
      zValor: s.zValor, zCalidad: s.zCalidad, zMomentum: s.zMomentum,
      piotroski: e.piotroski, roic: e.roic,
      guru: (e.guruScore ?? 0) > 0,
      etiqueta: etiquetaCalidad(e),
    }
  })
  return { items, universoTotal: empresas.length, conDatos: elegibles.length, sinValor }
}

// Diff del top entre dos snapshots (para el digest y los futuros avisos por cambio material).
export function diffRanking(anterior: string[], actual: string[]): { entran: string[]; salen: string[] } {
  const prev = new Set(anterior)
  const act = new Set(actual)
  return { entran: actual.filter(s => !prev.has(s)), salen: anterior.filter(s => !act.has(s)) }
}

const dias = (d1: string, d2: string) => Math.round((Date.parse(d2) - Date.parse(d1)) / 86_400_000)

// Elige qué snapshots pasados evaluar: el más cercano a cada objetivo (~4/~8/~13 semanas) dentro de
// una tolerancia, sin repetir fechas. Determinista (el consumidor aporta "hoy").
export function snapshotsParaEvaluar(
  fechas: string[], hoy: string, objetivosDias: number[] = [28, 56, 91], toleranciaDias = 10,
): string[] {
  const usadas = new Set<string>()
  const out: string[] = []
  for (const objetivo of objetivosDias) {
    let mejor: string | undefined
    let mejorDist = Infinity
    for (const f of fechas) {
      if (usadas.has(f)) continue
      const dist = Math.abs(dias(f, hoy) - objetivo)
      if (dist <= toleranciaDias && dist < mejorDist) { mejor = f; mejorDist = dist }
    }
    if (mejor) { usadas.add(mejor); out.push(mejor) }
  }
  return out
}

export type EvaluacionSnapshot = {
  fecha: string
  dias: number
  mediana: number | null    // de la cesta top del snapshot (la métrica que decide)
  retornoBench: number      // SPY en la misma ventana
  baten: number             // nº de picks que batieron individualmente al SPY
  n: number
}

// Agregado del track record (idea B del spec): cuántas ventanas baten al SPY por MEDIANA.
export function resumenTrackRecord(evals: EvaluacionSnapshot[]): { ventanas: number; bateVentanas: number } {
  return {
    ventanas: evals.length,
    bateVentanas: evals.filter(e => e.mediana != null && e.mediana > e.retornoBench).length,
  }
}
