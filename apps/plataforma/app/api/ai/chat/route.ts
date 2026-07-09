import { NextResponse } from 'next/server'
import { aiComplete, geminiSearch, openrouterChatEx, type NimChatMessage } from '@central/core-ai'
import {
  verificarSecreto, registrarUso, dentroDePresupuesto, dentroDePresupuestoDiario,
  estimarTokens, costeEur, costePorUso,
} from '@/lib/ai-gateway'
import { elegirModelo, openrouterConfigPasarela } from '@/lib/ia-director'
import { cacheActiva, buscarCache, guardarCache } from '@/lib/ia-cache'

export const maxDuration = 60

/** Pasarela IA — completion de texto. Camino primario: OpenRouter con el agente DIRECTOR
 *  eligiendo modelo (+ fallback NATIVO entre modelos vía `models: [...]`), gateado por el
 *  presupuesto DIARIO en € (global/app/cliente). Si OpenRouter falla o está bloqueado por
 *  presupuesto, cadena clásica GRATIS de siempre: `aiComplete` (NIM → Groq → Gemini → Kimi)
 *  y Gemini con búsqueda como último intento — el servicio degrada, nunca muere.
 *  Opt-in extra del caller: `cliente` (atribución de coste para refacturar), `privado` (proveedores
 *  no-training), `cache: {ambito, ttlHoras?}` (caché semántica, requiere IA_CACHE_SEMANTICA=1). */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const app = String(body?.app ?? 'desconocida')
  const clienteRef = typeof body?.cliente === 'string' && body.cliente.trim() ? body.cliente.trim().slice(0, 120) : null

  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'chat', proveedor: 'nim', modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido', clienteRef })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const messages: NimChatMessage[] = Array.isArray(body?.messages)
    ? body.messages
    : (body?.prompt ? [{ role: 'user', content: String(body.prompt) }] : [])
  if (!messages.length) return NextResponse.json({ error: 'Faltan messages' }, { status: 400 })
  const system = typeof body?.system === 'string' ? body.system : undefined
  const modelo = typeof body?.model === 'string' ? body.model : undefined
  const maxTokens = Number(body?.maxTokens) || 700
  const timeoutMs = Number(body?.timeoutMs) || 25_000
  const entrada = (system ?? '') + messages.map(m => m.content).join('\n')

  // Caché semántica (opt-in doble: env + caller). Clave = system + conversación entera del ámbito.
  const cacheCfg = body?.cache && typeof body.cache === 'object' && typeof body.cache.ambito === 'string'
    ? { ambito: String(body.cache.ambito).slice(0, 80), ttlHoras: Number(body.cache.ttlHoras) || undefined }
    : null
  if (cacheCfg && cacheActiva()) {
    const hit = await buscarCache(app, cacheCfg.ambito, entrada)
    if (hit) {
      await registrarUso({ app, endpoint: 'chat', proveedor: 'cache', modelo: hit.modelo, ok: true, ms: 0, tokens: 0, costeEur: 0, clienteRef })
      return NextResponse.json({ text: hit.respuesta, cache: true })
    }
  }

  // ── Camino primario: OpenRouter + Director (solo sin modelo NIM pinneado) ──────────────────
  const or = openrouterConfigPasarela()
  let openrouterBloqueado = false
  if (or && !modelo) {
    const presupuesto = await dentroDePresupuestoDiario(app, clienteRef)
    if (!presupuesto.ok) {
      openrouterBloqueado = true
      await registrarUso({ app, endpoint: 'chat', proveedor: 'openrouter', modelo: null, ok: false, ms: 0, error: presupuesto.motivo, clienteRef })
    } else {
      const dec = await elegirModelo(messages, { system, app, clienteRef })
      const t0 = Date.now()
      try {
        const res = await openrouterChatEx(or, messages, {
          system, maxTokens,
          models: [dec.model, ...dec.fallbacks],
          privacidad: body?.privado === true,
          cacheSystem: body?.cacheSystem === true,
          signal: AbortSignal.timeout(timeoutMs),
        })
        const tokens = res.usage?.total_tokens ?? estimarTokens(entrada, res.text)
        await registrarUso({
          app, endpoint: 'chat', proveedor: 'openrouter', modelo: res.model, ok: true,
          ms: Date.now() - t0, tokens, costeEur: costePorUso(res.model, res.usage, dec.modelos), clienteRef,
        })
        if (cacheCfg && cacheActiva()) void guardarCache(app, cacheCfg.ambito, entrada, res.text, { modelo: res.model, ttlHoras: cacheCfg.ttlHoras })
        return NextResponse.json({ text: res.text, modelo: res.model })
      } catch (e) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
        console.warn('[ai-gateway] chat OpenRouter falló, cadena clásica:', msg)
        await registrarUso({ app, endpoint: 'chat', proveedor: 'openrouter', modelo: dec.model, ok: false, ms: Date.now() - t0, error: msg, clienteRef })
        openrouterBloqueado = true // ya se intentó: que aiComplete no lo repita
      }
    }
  }

  // ── Cadena clásica GRATIS (NIM → Groq → Gemini → Kimi) — comportamiento de siempre ─────────
  const t0 = Date.now()
  try {
    const text = await aiComplete(messages, {
      system, model: modelo, maxTokens, timeoutMs,
      skipOpenRouter: openrouterBloqueado || !!or, // la pasarela ya gestionó OpenRouter aquí arriba
    })
    const tokens = estimarTokens(entrada, text)
    await registrarUso({ app, endpoint: 'chat', proveedor: 'nim', modelo: modelo ?? null, ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur('nim', tokens), clienteRef })
    if (cacheCfg && cacheActiva()) void guardarCache(app, cacheCfg.ambito, entrada, text, { modelo: modelo ?? null, ttlHoras: cacheCfg.ttlHoras })
    return NextResponse.json({ text })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
    console.warn('[ai-gateway] chat NIM falló, intento Gemini:', msg)
    // Fallback de proveedor DENTRO de la pasarela: NIM → Gemini (si hay key). Así las verticales
    // no necesitan ninguna key de proveedor propia.
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey) {
      const t1 = Date.now()
      try {
        const text = await geminiSearch({ apiKey: geminiKey }, system ?? '', messages.map(m => m.content).join('\n'), { maxTokens })
        const tokens = estimarTokens(entrada, text)
        await registrarUso({ app, endpoint: 'chat', proveedor: 'gemini', modelo: 'gemini-2.0-flash', ok: true, ms: Date.now() - t1, tokens, costeEur: costeEur('gemini', tokens), clienteRef })
        return NextResponse.json({ text })
      } catch (e2) {
        const msg2 = e2 instanceof Error ? `${e2.name}: ${e2.message}`.slice(0, 200) : 'error'
        await registrarUso({ app, endpoint: 'chat', proveedor: 'gemini', modelo: 'gemini-2.0-flash', ok: false, ms: Date.now() - t1, error: msg2, clienteRef })
        console.error('[ai-gateway] chat Gemini falló:', msg2)
      }
    }
    await registrarUso({ app, endpoint: 'chat', proveedor: 'nim', modelo: modelo ?? null, ok: false, ms: Date.now() - t0, error: msg, clienteRef })
    return NextResponse.json({ error: 'IA no disponible' }, { status: 502 })
  }
}
