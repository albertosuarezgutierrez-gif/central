import { NextResponse } from 'next/server'
import { aiTools, type NimToolMessage } from '@central/core-ai'
import { verificarSecreto, registrarUso, dentroDePresupuesto } from '@/lib/ai-gateway'

export const maxDuration = 60

/**
 * Pasarela IA — function-calling (NIM). Las verticales llaman con Bearer AI_GATEWAY_SECRET,
 * mandan `messages` + `tools` (formato OpenAI) y reciben `{content, tool_calls}`. Ejecutan las
 * herramientas en su lado y reenvían los resultados como mensajes `role:'tool'` en la siguiente vuelta.
 */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const app = String(body?.app ?? 'desconocida')

  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'tools', proveedor: 'nim', modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido' })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const messages: NimToolMessage[] = Array.isArray(body?.messages) ? body.messages : []
  const tools = Array.isArray(body?.tools) ? body.tools : []
  if (!messages.length || !tools.length) return NextResponse.json({ error: 'Faltan messages/tools' }, { status: 400 })
  const modelo = typeof body?.model === 'string' ? body.model : undefined

  const t0 = Date.now()
  try {
    const result = await aiTools(messages, tools, {
      system: typeof body?.system === 'string' ? body.system : undefined,
      model: modelo,
      maxTokens: Number(body?.maxTokens) || 1024,
    })
    await registrarUso({ app, endpoint: 'tools', proveedor: 'nim', modelo: modelo ?? null, ok: true, ms: Date.now() - t0 })
    return NextResponse.json({ content: result.content, tool_calls: result.tool_calls })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
    console.error('[ai-gateway] tools fallo:', msg)
    await registrarUso({ app, endpoint: 'tools', proveedor: 'nim', modelo: modelo ?? null, ok: false, ms: Date.now() - t0, error: msg })
    return NextResponse.json({ error: 'IA no disponible' }, { status: 502 })
  }
}
