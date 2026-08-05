// 📅 Fecha del próximo informe de resultados por Yahoo Finance (quoteSummary/calendarEvents).
// Da la fecha EXACTA anunciada por la empresa (isEarningsDateEstimate=false) o la prevista por
// Yahoo — mejor que el estimador EDGAR (+365d del filing del año pasado), que queda de RESPALDO.
// Yahoo exige desde 2023 una sesión cookie (A3 de fc.yahoo.com) + crumb; se abre una por proceso
// y se renueva sola si caduca (un 401 la invalida y se reintenta una vez). Verificado contra la
// respuesta real de STX el 05/08/2026 (fixture en el test). Best-effort: nunca lanza — null.

export type FechaEarnings = { fecha: string; confirmada: boolean }

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

/** Próxima fecha de resultados de un ticker de EEUU (o null si Yahoo no la da / falla). */
export async function proximaFechaEarningsYahoo(simbolo: string, hoy: string): Promise<FechaEarnings | null> {
  for (let intento = 0; intento < 2; intento++) {
    const s = await sesionYahoo()
    if (!s) return null
    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(simbolo)}` +
        `?modules=calendarEvents&crumb=${encodeURIComponent(s.crumb)}`
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Cookie: s.cookie }, signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status === 401 || res.status === 403) { sesion = null; continue }   // sesión caducada → renovar 1 vez
      if (!res.ok) return null
      return parseCalendarEvents(await res.json(), hoy)
    } catch { return null }
  }
  return null
}
