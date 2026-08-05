// 🪜 Escalera de dinero real — evaluación PURA y determinista de los requisitos FIRMADOS en
// docs/TRADING-HIPOTESIS-PREREGISTRO.md («💶 Plan de despliegue de capital REAL — escalera de
// tramos», firmada 2026-08-05). Este módulo NO inventa criterios: operacionaliza los firmados
// (la operacionalización exacta queda registrada como enmienda en el mismo doc).
//
// Regla de oro (Alberto, 05/08/2026): LA ESCALERA LA SUBEN LAS SEÑALES, NO EL CALENDARIO. Aquí no
// entra ninguna fecha objetivo: si los requisitos se dan en mes y medio, será entonces; si tardan
// cuatro meses, se espera. Y aunque un tramo salga ✅, cada tramo es una decisión SEPARADA de
// Alberto — este módulo solo mide. El agente JAMÁS ejecuta órdenes reales.
//
// Escalera firmada (cash de referencia ~33.400€ a 04/08/2026):
//  Tramo 1 — 1.000€ (~3%): requiere señal viva del agente EN EL MOMENTO de comprar (no evaluable
//            aquí en frío). Objetivo: medir fricción, no ganar.
//  Tramo 2 — +2.000€ (total ~9%): cesta paper más vieja ≥4 meses batiendo a su benchmark en
//            MEDIANA, y fricción del tramo 1 sin anomalías (round-trip ≤2% — se mide con trades
//            reales; aquí solo se recuerda).
//  Tramo 3 — +3.000€ (total ~18%): ≥3 cestas DISTINTAS, la más vieja ≥6 meses, batiendo ajustado
//            a riesgo. Operacionalización: mediana>SPY en ≥2/3 de las cestas maduras Y drawdown
//            ≤1,5× el del SPY en la cesta más vieja.
//  Techo 6.000€ hasta validación; congelador H6 (SPY < media 10 meses) manda sobre todo.

export const DIAS_TRAMO2 = 120   // ~4 meses
export const DIAS_TRAMO3 = 180   // ~6 meses
export const MIN_CESTAS_TRAMO3 = 3
export const FRACCION_CESTAS_BATIENDO = 2 / 3
export const FACTOR_DRAWDOWN_MAX = 1.5

export type CohorteEscalera = {
  cohorte: string
  dias: number
  alphaMediana: number | null       // mediana de la cesta − retorno del benchmark (fracción)
  maxDrawdown: number | null        // de la cesta (negativo)
  maxDrawdownBench: number | null   // del benchmark (negativo)
}

export type OrdenPaper = { simbolo: string; lado: string; precio: number; fecha: string }

export type EstadoTramo = { tramo: 1 | 2 | 3; titulo: string; ok: boolean; detalle: string }
export type EstadoEscalera = {
  tramos: EstadoTramo[]
  // Escalón más alto cuyos requisitos MEDIBLES cumplen hoy (el 1 siempre está disponible-con-señal).
  alcanzable: 1 | 2 | 3
}

// Empareja órdenes paper BUY→SELL por símbolo (la SELL cierra la última BUY previa sin consumir) y
// devuelve las operaciones CERRADAS con su retorno. Informativo (walk-forward del sistema de señales).
export function emparejarOps(ordenes: OrdenPaper[]): { simbolo: string; retorno: number }[] {
  const porFecha = [...ordenes].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const abiertas = new Map<string, number[]>()   // símbolo → precios de BUY pendientes (pila)
  const cerradas: { simbolo: string; retorno: number }[] = []
  for (const o of porFecha) {
    if (o.lado === 'BUY') {
      const pila = abiertas.get(o.simbolo) ?? []
      pila.push(o.precio)
      abiertas.set(o.simbolo, pila)
    } else if (o.lado === 'SELL') {
      const entrada = abiertas.get(o.simbolo)?.pop()
      if (entrada != null && entrada > 0) cerradas.push({ simbolo: o.simbolo, retorno: (o.precio - entrada) / entrada })
    }
  }
  return cerradas
}

const pctTxt = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const meses = (dias: number): string => `${(dias / 30).toFixed(1)} meses`

// Evalúa la escalera. `cohortes` deben venir YA deduplicadas por cesta (dos versiones con los mismos
// valores son UNA prueba, no dos — misma regla que el dashboard y el digest).
export function evaluarEscalera(cohortes: CohorteEscalera[]): EstadoEscalera {
  const masVieja = cohortes.length ? [...cohortes].sort((a, b) => b.dias - a.dias)[0] : null

  const t1: EstadoTramo = {
    tramo: 1, titulo: 'Tramo 1 — 1.000€ (~3%)', ok: true,
    detalle: 'disponible YA con señal viva del agente en el momento de comprar (nunca perseguir un gap). Objetivo: medir fricción, no ganar.',
  }

  const t2ok = masVieja != null && masVieja.dias >= DIAS_TRAMO2 && (masVieja.alphaMediana ?? -Infinity) > 0
  const t2: EstadoTramo = {
    tramo: 2, titulo: 'Tramo 2 — +2.000€ (total ~9%)', ok: t2ok,
    detalle: masVieja
      ? `cesta más vieja: ${meses(masVieja.dias)} de ${meses(DIAS_TRAMO2)} · mediana vs SPY ${masVieja.alphaMediana != null ? pctTxt(masVieja.alphaMediana) : 'sin dato'}${t2ok ? '' : ' — aún no'}. Además: fricción del tramo 1 sin anomalías (round-trip ≤2%, se mide con los trades reales).`
      : 'sin cohortes en seguimiento aún',
  }

  const maduras = cohortes.filter(c => c.dias >= DIAS_TRAMO3)
  const cestasOk = cohortes.length >= MIN_CESTAS_TRAMO3
  const viejaOk = masVieja != null && masVieja.dias >= DIAS_TRAMO3
  const baten = cohortes.filter(c => (c.alphaMediana ?? -Infinity) > 0)
  const batenOk = cohortes.length > 0 && baten.length >= Math.ceil(cohortes.length * FRACCION_CESTAS_BATIENDO)
  const riesgoOk = masVieja != null && masVieja.maxDrawdown != null && masVieja.maxDrawdownBench != null
    && Math.abs(masVieja.maxDrawdown) <= FACTOR_DRAWDOWN_MAX * Math.abs(masVieja.maxDrawdownBench)
  const t3ok = cestasOk && viejaOk && batenOk && riesgoOk
  const t3: EstadoTramo = {
    tramo: 3, titulo: 'Tramo 3 — +3.000€ (total ~18%, techo hasta validar)', ok: t3ok,
    detalle: [
      `${cohortes.length}/${MIN_CESTAS_TRAMO3} cestas distintas${cestasOk ? '' : ' ✗'}`,
      masVieja ? `más vieja ${meses(masVieja.dias)} de ${meses(DIAS_TRAMO3)}${viejaOk ? '' : ' ✗'}` : 'sin cestas ✗',
      cohortes.length ? `baten ${baten.length}/${cohortes.length} (≥2/3${batenOk ? '' : ' ✗'})` : '',
      masVieja?.maxDrawdown != null && masVieja.maxDrawdownBench != null
        ? `drawdown más vieja ${pctTxt(masVieja.maxDrawdown)} vs SPY ${pctTxt(masVieja.maxDrawdownBench)} (≤1,5×${riesgoOk ? '' : ' ✗'})`
        : 'riesgo: sin dato ✗',
      maduras.length ? '' : '(ninguna madura todavía)',
    ].filter(Boolean).join(' · '),
  }

  return { tramos: [t1, t2, t3], alcanzable: t3ok ? 3 : t2ok ? 2 : 1 }
}
