import { NextResponse } from 'next/server'
import { aiComplete, geminiSearch, type NimChatMessage } from '@central/core-ai'
import { verificarSecreto, registrarUso, dentroDePresupuesto, estimarTokens, costeEur } from '@/lib/ai-gateway'

export const maxDuration = 60

/** Pasarela IA — completion de texto (NIM → Groq → Gemini fallback). Las verticales llaman con Bearer AI_GATEWAY_SECRET.
 *  Nota: `aiComplete` ya cae internamente de NIM a Groq (gratis, mismo Llama 3.3 70B) si hay GROQ_API_KEY;
 *  el `catch` de abajo solo se alcanza si NIM y Groq fallan, y entonces prueba Gemini. */
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
  const system = typeof body?.system === 'string' ? body.system : undefined
  const modelo = typeof body?.model === 'string' ? body.model : undefined
  const maxTokens = Number(body?.maxTokens) || 700
  const entrada = (system ?? '') + messages.map(m => m.content).join('\n')

  const t0 = Date.now()
  try {
    const text = await aiComplete(messages, { system, model: modelo, maxTokens, timeoutMs: Number(body?.timeoutMs) || 25_000 })
    const tokens = estimarTokens(entrada, text)
    await registrarUso({ app, endpoint: 'chat', proveedor: 'nim', modelo: modelo ?? null, ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur('nim', tokens) })
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
        await registrarUso({ app, endpoint: 'chat', proveedor: 'gemini', modelo: 'gemini-2.0-flash', ok: true, ms: Date.now() - t1, tokens, costeEur: costeEur('gemini', tokens) })
        return NextResponse.json({ text })
      } catch (e2) {
        const msg2 = e2 instanceof Error ? `${e2.name}: ${e2.message}`.slice(0, 200) : 'error'
        await registrarUso({ app, endpoint: 'chat', proveedor: 'gemini', modelo: 'gemini-2.0-flash', ok: false, ms: Date.now() - t1, error: msg2 })
        console.error('[ai-gateway] chat Gemini falló:', msg2)
      }
    }
    await registrarUso({ app, endpoint: 'chat', proveedor: 'nim', modelo: modelo ?? null, ok: false, ms: Date.now() - t0, error: msg })
    return NextResponse.json({ error: 'IA no disponible' }, { status: 502 })
  }
}
