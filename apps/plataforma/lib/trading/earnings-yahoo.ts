// 📅💼 Fecha del próximo informe Y fundamentales de mercado por Yahoo Finance (quoteSummary).
// Sustituye a FMP (sin créditos desde hace meses — sus llamadas fallaban SIEMPRE y la estrategia
// «valor» y la barrera de earnings del torneo degradaban en silencio). Da la fecha EXACTA anunciada
// por la empresa (isEarningsDateEstimate=false) o la prevista por Yahoo — el estimador EDGAR
// (+365d del filing del año pasado) queda de RESPALDO — más PER/PB/deuda-EBITDA/margen del día.
// Yahoo exige desde 2023 una sesión cookie (A3 de fc.yahoo.com) + crumb; se abre una por proceso
// y se renueva sola si caduca (un 401 la invalida y se reintenta una vez). Verificado contra las
// respuestas reales de STX del 05/08/2026 (fixtures en el test). Best-effort: nunca lanza — null.

export type FechaEarnings = { fecha: string; confirmada: boolean }
// Campos ausentes = undefined, jamás 0 (regla NULL≠dato): un EBITDA negativo deja deudaEbitda fuera.
export type DatosYahoo = {
  earnings: FechaEarnings | null
  per?: number; pb?: number; deudaEbitda?: number; margenNeto?: number
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
const TIMEOUT_MS = 8_000

/** Parse puro de quoteSummary/calendarEvents. `earningsDate` trae 1 entrada (fecha concreta) o
 *  2 (rango estimado — se toma la primera). Una fecha ya pasada no es "próximo informe" → null. */
export function parseCalendarEvents(json: unknown, hoy: string): FechaEarnings | null {
  const earnings = (json as {
    quoteSummary?: { result?: Array<{ calendarEvents?: { earnings?: {
      earningsDate?: Array<{ fmt?: string }>
      isEarningsDateEstimate?: boolean
    } } }> }
  } | null)?.quoteSummary?.result?.[0]?.calendarEvents?.earnings
  const fecha = earnings?.earningsDate?.[0]?.fmt
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < hoy) return null
  return { fecha, confirmada: earnings?.isEarningsDateEstimate === false }
}

/** Línea 📅 del aviso nocturno: valores con resultados en ≤`diasMax` días. null = sin nada que avisar.
 *  El digest del radar es semanal (lunes) y los earnings caen entre semana — este aviso los caza a
 *  diario. Contexto para Alberto, jamás filtro (la barrera del torneo va aparte, en /analizar). */
export function lineaEarningsProximos(
  fechas: Array<{ simbolo: string; earnings: FechaEarnings | null }>,
  hoy: string,
  diasMax = 2,
): string | null {
  const partes: string[] = []
  for (const f of fechas) {
    if (!f.earnings) continue
    const dias = Math.round((Date.parse(f.earnings.fecha) - Date.parse(hoy)) / 86_400_000)
    if (dias < 0 || dias > diasMax) continue
    const cuando = dias === 0 ? 'HOY' : dias === 1 ? 'mañana' : `en ${dias} días (${f.earnings.fecha.slice(5)})`
    partes.push(`<b>${f.simbolo}</b> ${cuando}${f.earnings.confirmada ? '' : ' (sin confirmar)'}`)
  }
  return partes.length ? `📅 Resultados en la watchlist: ${partes.join(' · ')} — ojo al gap.` : null
}

/** Parse puro del quoteSummary completo: calendario + fundamentales de summaryDetail /
 *  financialData / defaultKeyStatistics. Cada campo {raw,fmt} se lee por `raw`. */
export function parseQuoteSummary(json: unknown, hoy: string): DatosYahoo | null {
  const r = (json as {
    quoteSummary?: { result?: Array<Record<string, Record<string, unknown> | undefined>> }
  } | null)?.quoteSummary?.result?.[0]
  if (!r) return null
  const raw = (x: unknown): number | undefined => {
    const v = (x as { raw?: unknown } | null | undefined)?.raw
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }
  const totalDebt = raw(r.financialData?.totalDebt)
  const ebitda = raw(r.financialData?.ebitda)
  return {
    earnings: parseCalendarEvents(json, hoy),
    per: raw(r.summaryDetail?.trailingPE),
    pb: raw(r.defaultKeyStatistics?.priceToBook),
    deudaEbitda: totalDebt !== undefined && ebitda !== undefined && ebitda > 0 ? totalDebt / ebitda : undefined,
    margenNeto: raw(r.financialData?.profitMargins),
  }
}

let sesion: { cookie: string; crumb: string } | null = null

async function sesionYahoo(): Promise<{ cookie: string; crumb: string } | null> {
  if (sesion) return sesion
  try {
    const r1 = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null)
    const cookie = r1?.headers.get('set-cookie')?.split(';')[0]
    if (!cookie?.startsWith('A3=')) return null
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie }, signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const crumb = (await r2.text()).trim()
    if (!r2.ok || !crumb || crumb.includes('<')) return null
    sesion = { cookie, crumb }
    return sesion
  } catch { return null }
}

/** Calendario + fundamentales de un ticker de EEUU en UNA llamada (o null si Yahoo falla). */
export async function datosYahoo(simbolo: string, hoy: string): Promise<DatosYahoo | null> {
  for (let intento = 0; intento < 2; intento++) {
    const s = await sesionYahoo()
    if (!s) return null
    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(simbolo)}` +
        `?modules=calendarEvents,summaryDetail,financialData,defaultKeyStatistics&crumb=${encodeURIComponent(s.crumb)}`
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Cookie: s.cookie }, signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status === 401 || res.status === 403) { sesion = null; continue }   // sesión caducada → renovar 1 vez
      if (!res.ok) return null
      return parseQuoteSummary(await res.json(), hoy)
    } catch { return null }
  }
  return null
}

/** Próxima fecha de resultados de un ticker de EEUU (o null si Yahoo no la da / falla). */
export async function proximaFechaEarningsYahoo(simbolo: string, hoy: string): Promise<FechaEarnings | null> {
  return (await datosYahoo(simbolo, hoy))?.earnings ?? null
}
