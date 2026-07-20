// 🌅 Vigía del PREMARKET (idea de Alberto, 20/07/2026): un gap grande antes de abrir suele venir CON
// noticia (resultados, 8-K, OPA) y es el complemento natural de la capa 📰 — juntos cuentan la historia.
// Es CONTEXTO, NUNCA filtro del ranking (misma regla que medias y 8-K): el premarket es ilíquido y los
// gaps se desinflan a menudo; en un modelo value un gap-up gordo suele significar precio escapándose de
// la zona de entrada, no "compra ya". Solo se vigila el top del último snapshot (~25 símbolos) y solo
// se avisa si algo se mueve de verdad — los días tranquilos, silencio. Fuente: el MISMO chart v8 de
// Yahoo que ya usamos de respaldo de precios, con `includePrePost=true` (gratis; Finviz premarket es
// de pago y bloquea bots — descartado 20/07/2026). Este archivo es PURO (testeable con node --test);
// el orquestador con Prisma+Telegram vive en `premarket-aviso.ts`.

export type GapPremarket = { cierrePrevio: number; ultimoPre: number; gap: number; velas: number }

// Movimiento mínimo para avisar: ±3% frente al cierre anterior.
export const UMBRAL_GAP = 0.03

const UA = 'Mozilla/5.0 (compatible; central-trading/1.0; paper-research)'

export function urlYahooPremarket(simbolo: string): string {
  const s = simbolo.trim().toUpperCase().replace(/\./g, '-')
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=5m&includePrePost=true`
}

// Parser PURO del chart intradía de Yahoo → gap del premarket de HOY. Devuelve null si falta el cierre
// previo, la ventana pre (currentTradingPeriod.pre) o no hay ninguna vela válida DENTRO de esa ventana
// (mercado cerrado, festivo, o datos rotos). El gap se mide contra meta.chartPreviousClose (cierre
// regular anterior), que es exactamente el "previous close" del que habla todo el mundo al citar gaps.
export function extraerGapPremarket(json: unknown): GapPremarket | null {
  const res = (json as {
    chart?: { result?: Array<{
      meta?: { chartPreviousClose?: number; currentTradingPeriod?: { pre?: { start?: number; end?: number } } }
      timestamp?: number[]
      indicators?: { quote?: Array<{ close?: Array<number | null> }> }
    }> }
  })?.chart?.result?.[0]
  const previo = res?.meta?.chartPreviousClose
  const pre = res?.meta?.currentTradingPeriod?.pre
  if (typeof previo !== 'number' || !(previo > 0)) return null
  if (typeof pre?.start !== 'number' || typeof pre?.end !== 'number') return null
  const ts = res?.timestamp ?? []
  const cierres = res?.indicators?.quote?.[0]?.close ?? []
  let ultimo: number | null = null
  let velas = 0
  for (let i = 0; i < cierres.length; i++) {
    const c = cierres[i]; const t = ts[i]
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0 || typeof t !== 'number') continue
    if (t < pre.start || t >= pre.end) continue
    ultimo = c; velas++
  }
  if (ultimo == null) return null
  return { cierrePrevio: previo, ultimoPre: ultimo, gap: ultimo / previo - 1, velas }
}

// Fetch best-effort del gap de un símbolo. Ante cualquier fallo → null (nunca rompe la pasada).
export async function gapPremarket(simbolo: string, timeoutMs = 8000): Promise<GapPremarket | null> {
  try {
    const res = await fetch(urlYahooPremarket(simbolo), {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return extraerGapPremarket(await res.json())
  } catch {
    return null
  }
}

// Arma las líneas del aviso Telegram a partir de los movimientos ya medidos (puro, testeable).
// Devuelve null si no hay movimientos — la señal de "hoy, silencio".
export type MovPremarket = { simbolo: string; gap: number; etiquetas: string[] }
export function mensajePremarket(movs: MovPremarket[]): string | null {
  if (!movs.length) return null
  const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
  const orden = [...movs].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  return [
    `🌅 <b>Premarket</b> — movimientos ≥${Math.round(UMBRAL_GAP * 100)}% en el top del radar (contexto, no filtra):`,
    ...orden.map(m => `· <b>${m.simbolo}</b> ${pct(m.gap)}${m.etiquetas.length ? ` 📰 ${m.etiquetas.join(' + ')}` : ''}`),
    '<i>Premarket = poca liquidez; el gap puede desinflarse en la apertura. SOLO paper.</i>',
  ].join('\n')
}
