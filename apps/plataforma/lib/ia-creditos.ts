// Lectura del saldo de OpenRouter (/api/v1/credits). Una sola función para el cron diario del
// saldo y el informe semanal del director, para que no puedan leer el saldo de dos formas.
// `null` = no se pudo leer (sin key, red, HTTP ≠ 200): nunca un saldo 0 inventado.

export type Creditos = { total: number; usado: number; restante: number }

export async function leerCreditosOpenRouter(): Promise<{ creditos: Creditos | null; motivo?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return { creditos: null, motivo: 'sin OPENROUTER_API_KEY' }
  try {
    const rc = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
    })
    if (!rc.ok) return { creditos: null, motivo: `OpenRouter /credits HTTP ${rc.status}` }
    const jc = (await rc.json()) as { data?: { total_credits?: number; total_usage?: number } }
    const total = Number(jc.data?.total_credits)
    const usado = Number(jc.data?.total_usage)
    if (!Number.isFinite(total) || !Number.isFinite(usado)) return { creditos: null, motivo: 'respuesta de /credits sin cifras' }
    return { creditos: { total, usado, restante: +(total - usado).toFixed(2) } }
  } catch (e) {
    return { creditos: null, motivo: e instanceof Error ? e.message.slice(0, 120) : 'error de red' }
  }
}
