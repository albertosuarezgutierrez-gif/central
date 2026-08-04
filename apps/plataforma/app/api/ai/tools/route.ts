import { NextResponse } from 'next/server'
import { aiTools, openrouterChatTools, type NimToolMessage } from '@central/core-ai'
import {
  verificarSecreto, registrarUso, dentroDePresupuesto, dentroDePresupuestoDiario,
  estimarTokens, costeEur,
} from '@/lib/ai-gateway'
import { openrouterConfigPasarela, modelosPorDefecto } from '@/lib/ia-director'

export const maxDuration = 60

/**
 * Pasarela IA — function-calling. Camino primario: OpenRouter (modelo por defecto + suplentes
 * vía fallback nativo `models`, sin Director: las llamadas con tools son estructuradas y no
 * ganan nada con el router), gateado por el presupuesto DIARIO. Si falla o está bloqueado →
 * cadena clásica (NIM → Groq, vía `aiTools`). Las verticales llaman con Bearer AI_GATEWAY_SECRET,
 * mandan `messages` + `tools` (formato OpenAI) y reciben `{content, tool_calls}`.
 */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const app = String(body?.app ?? 'desconocida')
  const clienteRef = typeof body?.cliente === 'string' && body.cliente.trim() ? body.cliente.trim().slice(0, 120) : null

  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'tools', proveedor: 'nim', modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido', clienteRef })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const messages: NimToolMessage[] = Array.isArray(body?.messages) ? body.messages : []
  const tools = Array.isArray(body?.tools) ? body.tools : []
  if (!messages.length || !tools.length) return NextResponse.json({ error: 'Faltan messages/tools' }, { status: 400 })
  const modelo = typeof body?.model === 'string' ? body.model : undefined
  const system = typeof body?.system === 'string' ? body.system : undefined
  const maxTokens = Number(body?.maxTokens) || 1024

  const tokensDe = (content: string | null, toolCalls: unknown) => estimarTokens(
    system ?? '', JSON.stringify(messages), JSON.stringify(tools), content, JSON.stringify(toolCalls ?? ''),
  )

  // ── Camino primario: OpenRouter (solo sin modelo NIM pinneado) ──────────────────────────────
  const or = openrouterConfigPasarela()
  let openrouterBloqueado = false
  if (or && !modelo) {
    const presupuesto = await dentroDePresupuestoDiario(app, clienteRef)
    if (!presupuesto.ok) {
      openrouterBloqueado = true
      await registrarUso({ app, endpoint: 'tools', proveedor: 'openrouter', modelo: null, ok: false, ms: 0, error: presupuesto.motivo, clienteRef })
    } else {
      const { model, fallbacks } = modelosPorDefecto()
      const t0 = Date.now()
      try {
        const result = await openrouterChatTools(or, messages, tools, {
          system, maxTokens,
          models: [model, ...fallbacks],
          privacidad: body?.privado === true,
          signal: AbortSignal.timeout(Number(body?.timeoutMs) || 25_000),
        })
        const tokens = tokensDe(result.content, result.tool_calls)
        await registrarUso({ app, endpoint: 'tools', proveedor: 'openrouter', modelo: model, ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur('openrouter', tokens), clienteRef })
        return NextResponse.json({ content: result.content, tool_calls: result.tool_calls })
      } catch (e) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
        console.warn('[ai-gateway] tools OpenRouter falló, cadena clásica:', msg)
        await registrarUso({ app, endpoint: 'tools', proveedor: 'openrouter', modelo: model, ok: false, ms: Date.now() - t0, error: msg, clienteRef })
        openrouterBloqueado = true
      }
    }
  }

  // ── Cadena clásica (NIM → Groq) — comportamiento de siempre ────────────────────────────────
  const t0 = Date.now()
  try {
    const result = await aiTools(messages, tools, {
      system, model: modelo, maxTokens,
      skipOpenRouter: openrouterBloqueado || !!or, // la pasarela ya gestionó OpenRouter aquí arriba
    })
    const tokens = tokensDe(result.content, result.tool_calls)
    await registrarUso({ app, endpoint: 'tools', proveedor: 'nim', modelo: modelo ?? null, ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur('nim', tokens), clienteRef })
    return NextResponse.json({ content: result.content, tool_calls: result.tool_calls })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
    console.error('[ai-gateway] tools fallo:', msg)
    await registrarUso({ app, endpoint: 'tools', proveedor: 'nim', modelo: modelo ?? null, ok: false, ms: Date.now() - t0, error: msg, clienteRef })
    return NextResponse.json({ error: 'IA no disponible' }, { status: 502 })
  }
}
