// src/lib/cashdro.ts
// Integración Cashdro HTTP — apertura de cajón y gestión de efectivo
// Cashdro expone una API REST local en la LAN del restaurante
// Referencia: Cashdro 3.0 / Cashdro SMART HTTP API
//
// IMPORTANTE: Las llamadas van del BRIDGE (local) a Cashdro (local LAN)
// Vercel no puede alcanzar IPs privadas — se debe llamar desde el Bridge
// Excepto para configuración y estado, que van vía Supabase como relay

export interface CashdroConfig {
  url: string      // ej: http://192.168.1.50:8080
  timeout?: number // ms, default 3000
}

export interface CashdroComandoResult {
  ok: boolean
  respuesta?: unknown
  error?: string
}

/**
 * Llama a un endpoint del Cashdro local.
 * Sólo funciona desde la LAN — usar desde el Bridge.
 */
export async function cashdroRequest(
  config: CashdroConfig,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<CashdroComandoResult> {
  const url = `${config.url.replace(/\/$/, '')}${endpoint}`
  const timeout = config.timeout ?? 3000

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, respuesta: data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

/** Abrir el cajón de efectivo */
export async function cashdroAbrirCajon(config: CashdroConfig): Promise<CashdroComandoResult> {
  return cashdroRequest(config, '/api/openCashDrawer', {})
}

/** Consultar estado del Cashdro (conectado, cargando, ocupado...) */
export async function cashdroEstado(config: CashdroConfig): Promise<CashdroComandoResult> {
  return cashdroRequest(config, '/api/status')
}

/** Iniciar transacción de cobro en efectivo */
export async function cashdroIniciarCobro(
  config: CashdroConfig,
  importe: number,         // euros con decimales
  referencia: string       // número de comanda / mesa
): Promise<CashdroComandoResult> {
  return cashdroRequest(config, '/api/payment', {
    amount: Math.round(importe * 100), // Cashdro trabaja en céntimos
    reference: referencia,
    currency: 'EUR',
  })
}

/** Consultar resultado de una transacción en curso */
export async function cashdroResultadoTransaccion(
  config: CashdroConfig,
  transactionId: string
): Promise<CashdroComandoResult> {
  return cashdroRequest(config, `/api/payment/${transactionId}`)
}
