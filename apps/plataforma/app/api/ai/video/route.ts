import { NextResponse } from 'next/server'
import { falTextToVideo, falImageToVideo } from '@central/core-ai'
import { verificarSecreto, registrarUso } from '@/lib/ai-gateway'

export const maxDuration = 120

/** Pasarela IA — generación de vídeo (fal.ai WAN 2.1). Las verticales llaman con Bearer AI_GATEWAY_SECRET.
 *  FAL_API_KEY vive solo aquí; ninguna vertical necesita su propia clave de fal.ai. */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    app?: string
    prompt?: string
    imageUrl?: string
    duration?: number
    aspectRatio?: '9:16' | '16:9' | '1:1'
    resolution?: '480p' | '720p' | '1080p'
  }

  const app = String(body?.app ?? 'desconocida')
  const prompt = String(body?.prompt ?? '').trim()
  if (!prompt) return NextResponse.json({ error: 'Falta prompt' }, { status: 400 })

  const apiKey = process.env.FAL_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'FAL_API_KEY no configurada en plataforma' }, { status: 503 })

  const opts = {
    duration: Number(body?.duration) || 5,
    aspectRatio: (body?.aspectRatio ?? '9:16') as '9:16' | '16:9' | '1:1',
    resolution: (body?.resolution ?? '720p') as '480p' | '720p' | '1080p',
  }

  const t0 = Date.now()
  try {
    const videoUrl = body.imageUrl
      ? await falImageToVideo({ apiKey }, body.imageUrl, prompt, opts)
      : await falTextToVideo({ apiKey }, prompt, opts)
    await registrarUso({ app, endpoint: 'video', proveedor: 'fal', modelo: 'wan-2.1', ok: true, ms: Date.now() - t0 })
    return NextResponse.json({ videoUrl })
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 200) : 'error'
    await registrarUso({ app, endpoint: 'video', proveedor: 'fal', modelo: 'wan-2.1', ok: false, ms: Date.now() - t0, error })
    return NextResponse.json({ error }, { status: 502 })
  }
}
