export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

// Flujo ASÍNCRONO (fal.ai tarda 1-5 min, más que cualquier timeout de Vercel):
//   GET /api/ig-ai-video?tipo=restaurante        → encola y devuelve { ok, jobId }
//   GET /api/ig-ai-video?jobId=...&modelo=...    → { ok, estado } o { ok, videoUrl }
// La cola vive en fal.ai (vía EF ig-video-gen); aquí no se espera nada.
async function llamarEF(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL no configurada')
  const res = await fetch(`${base.replace(/\/$/, '')}/functions/v1/ig-video-gen`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'x-story-secret': process.env.CRON_SECRET || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  return { status: res.status, data }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-story-secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams

  try {
    // Consulta de estado de un job existente
    const jobId = sp.get('jobId')
    if (jobId) {
      const { status, data } = await llamarEF({ action: 'status', requestId: jobId, modelo: sp.get('modelo') || undefined })
      return NextResponse.json(data, { status })
    }

    // Arrancar un job nuevo
    const tipo = sp.get('tipo') || 'restaurante'
    const prompt = sp.get('prompt') || PROMPTS[tipo] || PROMPTS['restaurante']
    const { status, data } = await llamarEF({ action: 'start', prompt })
    if (status !== 200) return NextResponse.json(data, { status })
    return NextResponse.json({
      ok: true,
      jobId: data.requestId,
      modelo: data.modelo,
      tipo,
      prompt,
      consultar: `/api/ig-ai-video?jobId=${data.requestId}`,
    })
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
    resolution?: '480p' | '720p' | '1080p'
    jobId?: string
    modelo?: string
  }

  try {
    if (body.jobId) {
      const { status, data } = await llamarEF({ action: 'status', requestId: body.jobId, modelo: body.modelo })
      return NextResponse.json(data, { status })
    }

    const tipo = body.tipo || 'restaurante'
    const prompt = body.prompt || PROMPTS[tipo] || PROMPTS['restaurante']
    const { status, data } = await llamarEF({
      action: 'start',
      prompt,
      imageUrl: body.imageUrl,
      resolution: body.resolution,
    })
    if (status !== 200) return NextResponse.json(data, { status })
    return NextResponse.json({
      ok: true,
      jobId: data.requestId,
      modelo: data.modelo,
      tipo,
      prompt,
      consultar: `/api/ig-ai-video?jobId=${data.requestId}${data.modelo === 'fal-ai/wan-i2v' ? '&modelo=fal-ai/wan-i2v' : ''}`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
