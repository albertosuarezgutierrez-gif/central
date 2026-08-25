import { NextResponse } from 'next/server'
import { nimVision, type ImageInput } from '@central/core-ai'
import { verificarSecreto, registrarUso, dentroDePresupuesto, PROVEEDOR_PASARELA, estimarTokens, costeEur } from '@/lib/ai-gateway'

const VISION_MODEL = 'meta/llama-3.2-90b-vision-instruct'

export const maxDuration = 60

/** Pasarela IA — visión / OCR (NIM vision). Bearer AI_GATEWAY_SECRET. */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const app = String(body?.app ?? 'desconocida')

  const key = process.env.NVIDIA_API_KEY
  if (!key) {
    await registrarUso({ app, endpoint: 'vision', proveedor: 'nim', modelo: null, ok: false, ms: 0, error: 'NVIDIA_API_KEY ausente' })
    return NextResponse.json({ error: 'Visión IA no configurada (falta NVIDIA_API_KEY)' }, { status: 503 })
  }
  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'vision', proveedor: PROVEEDOR_PASARELA, modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido' })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const images: ImageInput[] = Array.isArray(body?.images) ? body.images : []
  if (!images.length) return NextResponse.json({ error: 'Faltan images' }, { status: 400 })
  const modelo = typeof body?.model === 'string' && body.model ? body.model : VISION_MODEL
  const system = String(body?.system ?? '')
  const userText = String(body?.userText ?? '')

  const t0 = Date.now()
  try {
    const text = await nimVision({ apiKey: key, visionModel: modelo }, system, images, userText, Number(body?.maxTokens) || 512, {
      signal: AbortSignal.timeout(40_000),
    })
    // ~258 tokens por imagen (NIM vision) + texto de entrada/salida.
    const tokens = estimarTokens(system, userText, text) + images.length * 258
    await registrarUso({ app, endpoint: 'vision', proveedor: 'nim', modelo, ok: true, ms: Date.now() - t0, tokens, costeEur: costeEur('nim', tokens) })
    return NextResponse.json({ text })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error'
    console.error('[ai-gateway] vision fallo:', msg)
    await registrarUso({ app, endpoint: 'vision', proveedor: 'nim', modelo, ok: false, ms: Date.now() - t0, error: msg })
    return NextResponse.json({ error: 'Visión IA no disponible' }, { status: 502 })
  }
}
