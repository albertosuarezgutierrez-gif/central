import { NextResponse } from 'next/server'
import { verificarSecreto, registrarUso, dentroDePresupuesto, PROVEEDOR_PASARELA } from '@/lib/ai-gateway'
import { buscarWeb, busquedaConfigurada } from '@/lib/websearch'

export const maxDuration = 60

/** Pasarela IA — búsqueda web + síntesis. Bearer AI_GATEWAY_SECRET.
 *  Desde el 13/07/2026 enruta por `lib/websearch.ts::buscarWeb`: Gemini google_search (gratis)
 *  con el plugin `web` de OpenRouter como suplente de pago cuando Gemini está en racha de 429
 *  (antes este endpoint devolvía 502 y el seo-refresh de sivra se quedaba sin datos). */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const app = String(body?.app ?? 'desconocida')

  if (!busquedaConfigurada()) {
    await registrarUso({ app, endpoint: 'search', proveedor: PROVEEDOR_PASARELA, modelo: null, ok: false, ms: 0, error: 'sin GEMINI_API_KEY ni OPENROUTER_API_KEY' })
    return NextResponse.json({ error: 'Búsqueda IA no configurada (falta GEMINI_API_KEY u OPENROUTER_API_KEY)' }, { status: 503 })
  }
  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'search', proveedor: PROVEEDOR_PASARELA, modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido' })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const system = String(body?.system ?? '')
  const user = String(body?.user ?? '')
  if (!user) return NextResponse.json({ error: 'Falta user' }, { status: 400 })

  try {
    // buscarWeb registra cada intento (gemini y/o openrouter) en ai_usos por su cuenta.
    const res = await buscarWeb(system, user, { app, endpoint: 'search', maxTokens: Number(body?.maxTokens) || 1200, timeoutMs: 40_000 })
    return NextResponse.json({ text: res.text })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
    console.error('[ai-gateway] search fallo:', msg)
    return NextResponse.json({ error: 'Búsqueda IA no disponible' }, { status: 502 })
  }
}
