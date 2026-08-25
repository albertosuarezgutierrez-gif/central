// Núcleo REUTILIZABLE de la pasarela de IA (completion de texto), extraído de
// app/api/ai/chat/route.ts para que NO solo lo use el endpoint HTTP: cualquier agente del
// monorepo que corra dentro de plataforma (contable, concursos, huéspedes…) puede enrutar por
// el Agente DIRECTOR llamando a `chatConDirector` en vez de fijar su modelo a mano.
//
// Camino primario: OpenRouter con el Director eligiendo modelo (+ fallback nativo entre modelos).
// Si OpenRouter falla o está bloqueado por presupuesto diario → cadena clásica GRATIS de siempre
// (NIM → Groq → Kimi). Degrada, nunca muere. El control de presupuesto MENSUAL (429) y la
// autenticación siguen siendo del route HTTP.
//
// 🚨 GEMINI FUERA DE LA CADENA POR DEFECTO (02/08/2026): la key lleva desde el 16/06 sin un solo
// éxito (429 de cuota — 544 llamadas fallidas en 30 días, Check 12 del health-check) y el último
// intento con `geminiSearch` de aquí solo añadía un timeout de pago y filas rojas en `ai_usos`.
// Decisión de Alberto: «usa OpenRouter». Se reactiva con `GEMINI_TEXTO=1` cuando haya una key con
// cuota (mismo patrón que `GEMINI_WEBSEARCH` en `lib/websearch.ts`).

import { aiCompleteConProveedor, geminiSearch, openrouterChatEx, type NimChatMessage } from '@central/core-ai'
import {
  registrarUso, estimarTokens, costeEur, costePorUso, dentroDePresupuestoDiario,
} from '@/lib/ai-gateway'
import { elegirModelo, elegirPorCategoria, openrouterConfigPasarela } from '@/lib/ia-director'
import { cacheActiva, buscarCache, guardarCache } from '@/lib/ia-cache'

export type ChatDirectorOpts = {
  /** App que llama (para atribución de coste). */
  app: string
  /** Etiqueta del uso en ai_usos.endpoint (default 'chat'). */
  endpoint?: string
  system?: string
  maxTokens?: number
  /** Temperatura del muestreo (p. ej. 0.1 para JSON determinista). Se aplica en ambos caminos. */
  temperature?: number
  timeoutMs?: number
  /** Pin de modelo: SALTA el Director/OpenRouter y lo fija también en la cadena clásica. */
  modelo?: string
  /** Modelo preferido SOLO para la cadena clásica; NO salta el Director (para migrar agentes). */
  modeloClasico?: string
  /** Categoría del catálogo a servir SIN hop al decisor (p. ej. 'codigo' para el ejecutor de
   *  código). El caller ya sabe qué necesita → se elige por tag, más barato y determinista. */
  categoria?: string
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
    maxTokens = 700, temperature, timeoutMs = 25_000, cache: cacheCfg = null,
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
      // Con `categoria` el caller ya sabe qué modelo del catálogo quiere (p. ej. el ejecutor de
      // código pide el coder barato) → elección determinista por tag, sin hop al decisor.
      const dec = opts.categoria
        ? await elegirPorCategoria(opts.categoria, { app })
        : await elegirModelo(messages, { system, app, clienteRef, eu: opts.eu })
      const t0 = Date.now()
      try {
        const res = await openrouterChatEx(or, messages, {
          system, maxTokens, temperature,
          // OpenRouter rechaza con 400 un `models` de más de 3 elementos. En modo activo el
          // catálogo puede dar hasta 3 suplentes → [decidido, ...3] = 4 y la petición primaria
          // fallaba SIEMPRE (recuperaba con el modelo seguro, pero anulaba la ruta del Director
          // y ensuciaba ai_usos). Se limita a los 3 que acepta: primario + 2 mejores suplentes.
          models: [dec.model, ...dec.fallbacks].slice(0, 3),
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
        console.warn('[ai-gateway] chat OpenRouter falló, reintento con modelo seguro:', msg)
        await registrarUso({ app, endpoint, proveedor: 'openrouter', modelo: dec.model, ok: false, ms: Date.now() - t0, error: msg, clienteRef })
        // Reintento con un modelo FIABLE de un solo tiro: el fallback nativo de OpenRouter
        // (body `models`) NO atrapa el 429 "Provider returned error" del proveedor y devuelve
        // el 429 al cliente (incidente 11/07 → el Reel IA caía a la cadena clásica rota, NIM 27s
        // timeout + Gemini 2.5 muerto). Un `meta-llama/llama-3.3-70b-instruct` responde en <1s.
        const seguro = process.env.PASARELA_MODELO_SEGURO || 'meta-llama/llama-3.3-70b-instruct'
        if (seguro !== dec.model) {
          const t1 = Date.now()
          try {
            const res = await openrouterChatEx(or, messages, {
              system, maxTokens, models: [seguro],
              privacidad: opts.privado === true, cacheSystem: opts.cacheSystem === true,
              signal: AbortSignal.timeout(Math.min(timeoutMs, 15_000)),
            })
            const tokens = res.usage?.total_tokens ?? estimarTokens(entrada, res.text)
            await registrarUso({ app, endpoint, proveedor: 'openrouter', modelo: res.model, ok: true, ms: Date.now() - t1, tokens, costeEur: costePorUso(res.model, res.usage, dec.modelos), clienteRef })
            if (cacheCfg && cacheActiva()) void guardarCache(app, cacheCfg.ambito, entrada, res.text, { modelo: res.model, ttlHoras: cacheCfg.ttlHoras })
            return { text: res.text, modelo: res.model }
          } catch (e2) {
            const msg2 = e2 instanceof Error ? `${e2.name}: ${e2.message}`.slice(0, 200) : 'error'
            console.warn('[ai-gateway] chat modelo seguro también falló:', msg2)
            await registrarUso({ app, endpoint, proveedor: 'openrouter', modelo: seguro, ok: false, ms: Date.now() - t1, error: msg2, clienteRef })
          }
        }
        openrouterBloqueado = true // ya se intentó: que aiComplete no lo repita
      }
    }
  }

  // ── Cadena clásica GRATIS (NIM → Groq → Cerebras → Gemini → Kimi) — comportamiento de siempre ──
  const modeloCadena = modelo ?? modeloClasico
  const t0 = Date.now()
  try {
    // 🚨 `aiComplete` es una caja negra (devuelve solo el texto): NO asumir que sirvió NIM solo
    // porque es el primario de la cadena — Groq/Cerebras/Gemini/Kimi pueden haber respondido en
    // su lugar (25/08/2026, ver cabecera de `aiCompleteConProveedor` en core-ai). Registrar el
    // proveedor REAL importa por dos motivos: (1) si NIM muere, Groq/Cerebras lo taparían
    // indefinidamente bajo la etiqueta 'nim' y el Check 12 del health-check nunca lo vería
    // (mismo patrón que dejó a Gemini acumulando fallos fantasma, pero al revés); (2) Kimi es DE
    // PAGO — atribuirlo a 'nim' (gratis) subestima el gasto real. `costeEur()` sigue devolviendo 0
    // para groq/cerebras/kimi (sin tarifa cargada todavía; groq/cerebras SÍ son gratis, kimi no —
    // pendiente de tarifa real, no se inventa una).
    const res = await aiCompleteConProveedor(messages, {
      system, model: modeloCadena, maxTokens, temperature, timeoutMs,
      skipOpenRouter: openrouterBloqueado || !!or, // la pasarela ya gestionó OpenRouter aquí arriba
    })
    const tokens = estimarTokens(entrada, res.text)
    await registrarUso({ app, endpoint, proveedor: res.proveedor, modelo: res.modelo, ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur(res.proveedor, tokens), clienteRef })
    if (cacheCfg && cacheActiva()) void guardarCache(app, cacheCfg.ambito, entrada, res.text, { modelo: res.modelo, ttlHoras: cacheCfg.ttlHoras })
    return { text: res.text, modelo: res.modelo }
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
    console.warn('[ai-gateway] chat: cadena clásica falló:', msg)
    // Último intento con Gemini SOLO si está reactivado a mano (GEMINI_TEXTO=1, ver cabecera):
    // con la key sin cuota este eslabón era puro peaje.
    const geminiKey = process.env.GEMINI_TEXTO === '1' ? process.env.GEMINI_API_KEY : undefined
    if (geminiKey) {
      const t1 = Date.now()
      try {
        const text = await geminiSearch({ apiKey: geminiKey }, system ?? '', messages.map(m => m.content).join('\n'), { maxTokens })
        const tokens = estimarTokens(entrada, text)
        await registrarUso({ app, endpoint, proveedor: 'gemini', modelo: 'gemini-flash-latest', ok: true, ms: Date.now() - t1, tokens, costeEur: costeEur('gemini', tokens), clienteRef })
        return { text, modelo: 'gemini-flash-latest' }
      } catch (e2) {
        const msg2 = e2 instanceof Error ? `${e2.name}: ${e2.message}`.slice(0, 200) : 'error'
        await registrarUso({ app, endpoint, proveedor: 'gemini', modelo: 'gemini-flash-latest', ok: false, ms: Date.now() - t1, error: msg2, clienteRef })
        console.error('[ai-gateway] chat Gemini falló:', msg2)
      }
    }
    await registrarUso({ app, endpoint, proveedor: 'nim', modelo: modeloCadena ?? null, ok: false, ms: Date.now() - t0, error: msg, clienteRef })
    throw new Error('IA no disponible')
  }
}
