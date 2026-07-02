export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'

// Plantillas de prompt para hostelería — el caller puede pasar su propio prompt
// o usar uno de estos tipos predefinidos.
const PROMPTS: Record<string, string> = {
  restaurante: 'Elegant restaurant interior, warm candlelight, empty tables with white tablecloths, cinematic, vertical format, photorealistic',
  cocina: 'Professional chef plating gourmet food in a modern restaurant kitchen, close-up, cinematic lighting, vertical',
  ambiente: 'Cozy restaurant terrace at golden hour, people dining, blurred bokeh background, vertical cinematic video',
  copa: 'Close-up of wine being poured into a glass, slow motion, restaurant bokeh background, vertical format',
  entrada: 'Restaurant entrance at night with warm lights, elegant signage, cinematic vertical shot',
  postre: 'Elegant dessert plating with chocolate drizzle, close-up slow motion, restaurant table setting',
}

// La generación (fal.ai, 60-180s) vive en la Edge Function ig-video-gen porque
// Vercel corta las funciones de ia-rest a ~60s reales. La EF corre sin ese límite;
// aquí solo se espera su respuesta.
async function generarVideo(body: {
  prompt: string
  imageUrl?: string
  duration?: number
  resolution?: '480p' | '720p' | '1080p'
}): Promise<string> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL no configurada')
  const res = await fetch(`${base.replace(/\/$/, '')}/functions/v1/ig-video-gen`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'x-story-secret': process.env.CRON_SECRET || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: body.prompt,
      imageUrl: body.imageUrl,
      aspectRatio: '9:16',
      resolution: body.resolution || '720p',
      duration: body.duration || 5,
    }),
    signal: AbortSignal.timeout(110_000),
  })
  const data = await res.json().catch(() => ({})) as { ok?: boolean; videoUrl?: string; error?: string }
  if (!res.ok || typeof data?.videoUrl !== 'string')
    throw new Error(`ig-video-gen HTTP ${res.status}: ${data?.error ?? 'respuesta sin videoUrl'}`)
  return data.videoUrl
}

// GET /api/ig-ai-video?tipo=restaurante
// POST /api/ig-ai-video  { tipo?, prompt?, imageUrl?, duration?, resolution? }
// Devuelve { ok: true, videoUrl } — URL del MP4 9:16 listo para publicar en Instagram.
// FAL_API_KEY vive en los secrets de Supabase (EF ig-video-gen), no en Vercel.
export async function GET(req: NextRequest) {
  if (req.headers.get('x-story-secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const tipo = sp.get('tipo') || 'restaurante'
  const prompt = sp.get('prompt') || PROMPTS[tipo] || PROMPTS['restaurante']

  try {
    const videoUrl = await generarVideo({ prompt })
    return NextResponse.json({ ok: true, videoUrl, tipo, prompt })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-story-secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    tipo?: string
    prompt?: string
    imageUrl?: string
    duration?: number
    resolution?: '480p' | '720p' | '1080p'
  }

  const tipo = body.tipo || 'restaurante'
  const prompt = body.prompt || PROMPTS[tipo] || PROMPTS['restaurante']

  try {
    const videoUrl = await generarVideo({
      prompt,
      imageUrl: body.imageUrl,
      duration: body.duration,
      resolution: body.resolution,
    })
    return NextResponse.json({ ok: true, videoUrl, tipo, prompt })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
