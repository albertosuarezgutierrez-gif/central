// Búsqueda web + síntesis con FALLBACK — política única de la pasarela para todo lo que
// necesita datos frescos de internet (eventos de pricing, seo-refresh, /api/ai/search).
//
// Por qué existe: el grounding de Gemini (gratis) lleva rachas largas de 429 y todo lo que
// dependía de él en exclusiva se quedaba mudo (el cron de eventos por websearch llevaba
// semanas sin aportar filas). Cadena: Gemini google_search (GRATIS) → plugin `web` de
// OpenRouter (DE PAGO, ~0,02€/llamada con 5 resultados; respeta el presupuesto diario de la
// pasarela). Ambos intentos quedan en `ai_usos` (endpoint del caller) — mismo auditor que el chat.

import { geminiSearch, openrouterSearchEx } from '@central/core-ai'
import { registrarUso, estimarTokens, costeEur, dentroDePresupuestoDiario } from '@/lib/ai-gateway'
import { openrouterConfigPasarela } from '@/lib/ia-director'

// Tarifa del plugin web de OpenRouter: 4$/1000 resultados → 5 resultados ≈ 0,02$ ≈ 0,018€.
// Se suma al coste por tokens del modelo. Override por env si OpenRouter cambia el precio.
const WEB_RESULTS = 5
const PLUGIN_EUR = Number(process.env.AI_PRECIO_WEBPLUGIN_EUR ?? 0.018)

export type BuscarWebOpts = {
  /** App que llama (atribución en ai_usos). */
  app: string
  /** Etiqueta en ai_usos.endpoint (p. ej. 'search', 'eventos', 'seo'). */
  endpoint: string
  maxTokens?: number
  timeoutMs?: number
}

export type BuscarWebResult = { text: string; proveedor: 'gemini' | 'openrouter'; modelo: string }

/** ¿Hay ALGUNA vía de búsqueda configurada? (para que los callers gateen su no-op). */
export function busquedaConfigurada(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY)
}

/**
 * Búsqueda web con síntesis. Lanza solo si TODAS las vías fallan (el caller decide qué hacer).
 * Gemini primero (gratis); si falla o no hay key, OpenRouter con el plugin `web` (de pago,
 * gateado por el presupuesto diario de la pasarela).
 */
export async function buscarWeb(system: string, user: string, opts: BuscarWebOpts): Promise<BuscarWebResult> {
  const { app, endpoint, maxTokens = 1500, timeoutMs = 40_000 } = opts
  const errores: string[] = []

  const geminiKey = process.env.GEMINI_API_KEY
  if (geminiKey) {
    const t0 = Date.now()
    try {
      const text = await geminiSearch({ apiKey: geminiKey }, system, user, { maxTokens, timeoutMs })
      const tokens = estimarTokens(system, user, text)
      await registrarUso({ app, endpoint, proveedor: 'gemini', modelo: 'gemini-flash-latest', ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur('gemini', tokens) })
      return { text, proveedor: 'gemini', modelo: 'gemini-flash-latest' }
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
      errores.push(`gemini: ${msg}`)
      await registrarUso({ app, endpoint, proveedor: 'gemini', modelo: 'gemini-flash-latest', ok: false, ms: Date.now() - t0, error: msg })
      console.warn('[websearch] Gemini falló, intento OpenRouter web:', msg)
    }
  }

  const or = openrouterConfigPasarela()
  if (or) {
    const presupuesto = await dentroDePresupuestoDiario(app)
    if (!presupuesto.ok) {
      errores.push(`openrouter: ${presupuesto.motivo}`)
      await registrarUso({ app, endpoint, proveedor: 'openrouter', modelo: null, ok: false, ms: 0, error: presupuesto.motivo })
    } else {
      const t0 = Date.now()
      try {
        const res = await openrouterSearchEx(or, system, user, { maxTokens, timeoutMs, maxResults: WEB_RESULTS })
        const tokens = res.usage?.total_tokens ?? estimarTokens(system, user, res.text)
        await registrarUso({
          app, endpoint, proveedor: 'openrouter', modelo: `${res.model}+web`, ok: true,
          ms: Date.now() - t0, tokens, costeEur: +(costeEur('openrouter', tokens) + PLUGIN_EUR).toFixed(6),
        })
        return { text: res.text, proveedor: 'openrouter', modelo: res.model }
      } catch (e) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
        errores.push(`openrouter: ${msg}`)
        await registrarUso({ app, endpoint, proveedor: 'openrouter', modelo: null, ok: false, ms: Date.now() - t0, error: msg })
        console.error('[websearch] OpenRouter web también falló:', msg)
      }
    }
  }

  if (!geminiKey && !or) throw new Error('Búsqueda web no configurada (ni GEMINI_API_KEY ni OPENROUTER_API_KEY)')
  throw new Error(`Búsqueda web no disponible: ${errores.join(' | ') || 'sin vías'}`)
}
