import { NextResponse } from 'next/server'
import type { NimChatMessage } from '@central/core-ai'
import { verificarSecreto, registrarUso, dentroDePresupuesto, PROVEEDOR_PASARELA } from '@/lib/ai-gateway'
import { chatConDirector } from '@/lib/pasarela'

export const maxDuration = 60

/** Pasarela IA — completion de texto. La lógica (Director + OpenRouter + cadena gratis + caché)
 *  vive en `lib/pasarela.ts::chatConDirector`, reutilizable por los agentes internos. Este route
 *  solo hace de puerto HTTP: autentica, aplica el presupuesto MENSUAL (429) y traduce a JSON.
 *  Opt-in del caller: `cliente` (atribución de coste), `privado` (proveedores no-training),
 *  `cache: {ambito, ttlHoras?}` (caché semántica, requiere IA_CACHE_SEMANTICA=1). */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const app = String(body?.app ?? 'desconocida')
  const clienteRef = typeof body?.cliente === 'string' && body.cliente.trim() ? body.cliente.trim().slice(0, 120) : null

  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'chat', proveedor: PROVEEDOR_PASARELA, modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido', clienteRef })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const messages: NimChatMessage[] = Array.isArray(body?.messages)
    ? body.messages
    : (body?.prompt ? [{ role: 'user', content: String(body.prompt) }] : [])
  if (!messages.length) return NextResponse.json({ error: 'Faltan messages' }, { status: 400 })

  const cacheCfg = body?.cache && typeof body.cache === 'object' && typeof body.cache.ambito === 'string'
    ? { ambito: String(body.cache.ambito).slice(0, 80), ttlHoras: Number(body.cache.ttlHoras) || undefined }
    : null

  try {
    const r = await chatConDirector(messages, {
      app, endpoint: 'chat',
      system: typeof body?.system === 'string' ? body.system : undefined,
      modelo: typeof body?.model === 'string' ? body.model : undefined,
      maxTokens: Number(body?.maxTokens) || 700,
      timeoutMs: Number(body?.timeoutMs) || 25_000,
      clienteRef,
      privado: body?.privado === true,
      cacheSystem: body?.cacheSystem === true,
      cache: cacheCfg,
    })
    return NextResponse.json(r.cache ? { text: r.text, cache: true } : { text: r.text, modelo: r.modelo })
  } catch {
    return NextResponse.json({ error: 'IA no disponible' }, { status: 502 })
  }
}
