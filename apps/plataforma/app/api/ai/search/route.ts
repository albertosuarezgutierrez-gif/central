import { NextResponse } from 'next/server'
import { geminiSearch } from '@central/core-ai'
import { verificarSecreto, registrarUso, dentroDePresupuesto, estimarTokens, costeEur } from '@/lib/ai-gateway'

export const maxDuration = 60

/** Pasarela IA — búsqueda web + síntesis (Gemini). Bearer AI_GATEWAY_SECRET. */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const app = String(body?.app ?? 'desconocida')

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    await registrarUso({ app, endpoint: 'search', proveedor: 'gemini', modelo: null, ok: false, ms: 0, error: 'GEMINI_API_KEY ausente' })
    return NextResponse.json({ error: 'Búsqueda IA no configurada (falta GEMINI_API_KEY)' }, { status: 503 })
  }
  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'search', proveedor: 'gemini', modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido' })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const system = String(body?.system ?? '')
  const user = String(body?.user ?? '')
  if (!user) return NextResponse.json({ error: 'Falta user' }, { status: 400 })

  const t0 = Date.now()
  try {
    const text = await geminiSearch({ apiKey: key }, system, user, { maxTokens: Number(body?.maxTokens) || 1200, timeoutMs: 40_000 })
    const tokens = estimarTokens(system, user, text)
    await registrarUso({ app, endpoint: 'search', proveedor: 'gemini', modelo: 'gemini-flash-latest', ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur('gemini', tokens) })
    return NextResponse.json({ text })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
    console.error('[ai-gateway] search fallo:', msg)
    await registrarUso({ app, endpoint: 'search', proveedor: 'gemini', modelo: 'gemini-flash-latest', ok: false, ms: Date.now() - t0, error: msg })
    return NextResponse.json({ error: 'Búsqueda IA no disponible' }, { status: 502 })
  }
}
