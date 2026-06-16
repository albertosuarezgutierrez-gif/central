import { NextResponse } from 'next/server'
import { aiComplete, type NimChatMessage } from '@central/core-ai'
import { verificarSecreto, registrarUso, dentroDePresupuesto } from '@/lib/ai-gateway'

/** Pasarela IA — completion de texto (NIM). Las verticales llaman con Bearer AI_GATEWAY_SECRET. */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const app = String(body?.app ?? 'desconocida')

  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'chat', proveedor: 'nim', modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido' })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const messages: NimChatMessage[] = Array.isArray(body?.messages)
    ? body.messages
    : (body?.prompt ? [{ role: 'user', content: String(body.prompt) }] : [])
  if (!messages.length) return NextResponse.json({ error: 'Faltan messages' }, { status: 400 })
  const modelo = typeof body?.model === 'string' ? body.model : undefined

  const t0 = Date.now()
  try {
    const text = await aiComplete(messages, {
      system: typeof body?.system === 'string' ? body.system : undefined,
      model: modelo,
      maxTokens: Number(body?.maxTokens) || 700,
      timeoutMs: Number(body?.timeoutMs) || 20_000,
    })
    await registrarUso({ app, endpoint: 'chat', proveedor: 'nim', modelo: modelo ?? null, ok: true, ms: Date.now() - t0 })
    return NextResponse.json({ text })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
    console.error('[ai-gateway] chat fallo:', msg)
    await registrarUso({ app, endpoint: 'chat', proveedor: 'nim', modelo: modelo ?? null, ok: false, ms: Date.now() - t0, error: msg })
    return NextResponse.json({ error: 'IA no disponible' }, { status: 502 })
  }
}
