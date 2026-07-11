// Núcleo REUTILIZABLE de la pasarela de IA (completion de texto), extraído de
// app/api/ai/chat/route.ts para que NO solo lo use el endpoint HTTP: cualquier agente del
// monorepo que corra dentro de plataforma (contable, concursos, huéspedes…) puede enrutar por
// el Agente DIRECTOR llamando a `chatConDirector` en vez de fijar su modelo a mano.
//
// Camino primario: OpenRouter con el Director eligiendo modelo (+ fallback nativo entre modelos).
// Si OpenRouter falla o está bloqueado por presupuesto diario → cadena clásica GRATIS de siempre
// (NIM → Groq → Gemini → Kimi) y Gemini con búsqueda como último intento. Degrada, nunca muere.
// El control de presupuesto MENSUAL (429) y la autenticación siguen siendo del route HTTP.

import { aiComplete, geminiSearch, openrouterChatEx, type NimChatMessage } from '@central/core-ai'
import {
  registrarUso, estimarTokens, costeEur, costePorUso, dentroDePresupuestoDiario,
} from '@/lib/ai-gateway'
import { elegirModelo, openrouterConfigPasarela } from '@/lib/ia-director'
import { cacheActiva, buscarCache, guardarCache } from '@/lib/ia-cache'

export type ChatDirectorOpts = {
  /** App que llama (para atribución de coste). */
  app: string
  /** Etiqueta del uso en ai_usos.endpoint (default 'chat'). */
  endpoint?: string
  system?: string
  maxTokens?: number
  timeoutMs?: number
  /** Pin de modelo: SALTA el Director/OpenRouter y lo fija también en la cadena clásica. */
  modelo?: string
  /** Modelo preferido SOLO para la cadena clásica; NO salta el Director (para migrar agentes). */
  modeloClasico?: string
  /** Atribución de coste al cliente final (refacturación). */
  clienteRef?: string | null
  /** Datos sensibles: proveedores no-training + preferencia de modelos UE en el Director. */
  privado?: boolean
  eu?: boolean
  cacheSystem?: boolean
  cache?: { ambito: string; ttlHoras?: number } | null
}

export type ChatDirectorResult = { text: string; modelo: string | null; cache?: boolean }

/**
 * Un turno de texto por la pasarela con el Agente Director. Devuelve el texto y el modelo servido.
 * Lanza solo si TODO el cascada falla (el route HTTP lo traduce a 502).
 */
export async function chatConDirector(messages: NimChatMessage[], opts: ChatDirectorOpts): Promise<ChatDirectorResult> {
  const {
    app, endpoint = 'chat', system, modelo, modeloClasico, clienteRef = null,
    maxTokens = 700, timeoutMs = 25_000, cache: cacheCfg = null,
  } = opts
  const entrada = (system ?? '') + messages.map(m => m.content).join('\n')

  // Caché semántica (opt-in doble: env + caller). Clave = system + conversación entera del ámbito.
  if (cacheCfg && cacheActiva()) {
    const hit = await buscarCache(app, cacheCfg.ambito, entrada)
    if (hit) {
      await registrarUso({ app, endpoint, proveedor: 'cache', modelo: hit.modelo, ok: true, ms: 0, tokens: 0, costeEur: 0, clienteRef })
      return { text: hit.respuesta, modelo: hit.modelo, cache: true }
    }
  }

  // ── Camino primario: OpenRouter + Director (solo sin modelo pinneado) ──────────────────────
  const or = openrouterConfigPasarela()
  let openrouterBloqueado = false
  if (or && !modelo) {
    const presupuesto = await dentroDePresupuestoDiario(app, clienteRef)
    if (!presupuesto.ok) {
      openrouterBloqueado = true
      await registrarUso({ app, endpoint, proveedor: 'openrouter', modelo: null, ok: false, ms: 0, error: presupuesto.motivo, clienteRef })
    } else {
      const dec = await elegirModelo(messages, { system, app, clienteRef, eu: opts.eu })
      const t0 = Date.now()
      try {
        const res = await openrouterChatEx(or, messages, {
          system, maxTokens,
          models: [dec.model, ...dec.fallbacks],
          privacidad: opts.privado === true,
          cacheSystem: opts.cacheSystem === true,
          signal: AbortSignal.timeout(timeoutMs),
        })
        const tokens = res.usage?.total_tokens ?? estimarTokens(entrada, res.text)
        await registrarUso({
          app, endpoint, proveedor: 'openrouter', modelo: res.model, ok: true,
          ms: Date.now() - t0, tokens, costeEur: costePorUso(res.model, res.usage, dec.modelos), clienteRef,
        })
        if (cacheCfg && cacheActiva()) void guardarCache(app, cacheCfg.ambito, entrada, res.text, { modelo: res.model, ttlHoras: cacheCfg.ttlHoras })
        return { text: res.text, modelo: res.model }
      } catch (e) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
        console.warn('[ai-gateway] chat OpenRouter falló, cadena clásica:', msg)
        await registrarUso({ app, endpoint, proveedor: 'openrouter', modelo: dec.model, ok: false, ms: Date.now() - t0, error: msg, clienteRef })
        openrouterBloqueado = true // ya se intentó: que aiComplete no lo repita
      }
    }
  }

  // ── Cadena clásica GRATIS (NIM → Groq → Gemini → Kimi) — comportamiento de siempre ─────────
  const modeloCadena = modelo ?? modeloClasico
  const t0 = Date.now()
  try {
    const text = await aiComplete(messages, {
      system, model: modeloCadena, maxTokens, timeoutMs,
      skipOpenRouter: openrouterBloqueado || !!or, // la pasarela ya gestionó OpenRouter aquí arriba
    })
    const tokens = estimarTokens(entrada, text)
    await registrarUso({ app, endpoint, proveedor: 'nim', modelo: modeloCadena ?? null, ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur('nim', tokens), clienteRef })
    if (cacheCfg && cacheActiva()) void guardarCache(app, cacheCfg.ambito, entrada, text, { modelo: modeloCadena ?? null, ttlHoras: cacheCfg.ttlHoras })
    return { text, modelo: modeloCadena ?? null }
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
        await registrarUso({ app, endpoint, proveedor: 'gemini', modelo: 'gemini-2.5-flash', ok: true, ms: Date.now() - t1, tokens, costeEur: costeEur('gemini', tokens), clienteRef })
        return { text, modelo: 'gemini-2.5-flash' }
      } catch (e2) {
        const msg2 = e2 instanceof Error ? `${e2.name}: ${e2.message}`.slice(0, 200) : 'error'
        await registrarUso({ app, endpoint, proveedor: 'gemini', modelo: 'gemini-2.5-flash', ok: false, ms: Date.now() - t1, error: msg2, clienteRef })
        console.error('[ai-gateway] chat Gemini falló:', msg2)
      }
    }
    await registrarUso({ app, endpoint, proveedor: 'nim', modelo: modeloCadena ?? null, ok: false, ms: Date.now() - t0, error: msg, clienteRef })
    throw new Error('IA no disponible')
  }
}
