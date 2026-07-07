export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'

// Plantillas de prompt para hostelería — el caller puede pasar su propio prompt
// o usar uno de estos tipos predefinidos.
// Reels de PRODUCTO: escenas dinámicas que muestran cómo iarest mejora la gestión
// del bar/restaurante. Regla de oro: describir MOVIMIENTO explícito (cámara, gente,
// pantallas) — sin movimiento el modelo genera una foto estática.
const PROMPTS: Record<string, string> = {
  voz: 'Energetic young waiter in a busy Spanish tapas bar speaks into a smartphone while walking between crowded tables, the order instantly appears as glowing text on a sleek tablet at the kitchen pass, fast dolly camera following him, dynamic modern commercial style, shallow depth of field, vertical 9:16',
  cocina: 'Modern restaurant kitchen in full service, chefs plating dishes fast, a large wall-mounted kitchen display screen updates with new orders in real time with smooth animations, steam rising, whip-pan camera moves between stations, high-energy tech commercial look, vertical 9:16',
  qr: 'Customer at a sunny terrace table scans a QR code on the table with her phone, camera pushes in over her shoulder as a beautiful digital menu slides onto the screen and she taps to order, drinks arrive moments later, bright vibrant colors, snappy modern advert style, vertical 9:16',
  datos: 'Restaurant owner leaning on the bar at closing time looks at a tablet where animated sales charts and colorful analytics dashboards rise and glow, camera slowly orbits around him, warm bar lights bokeh in background, cinematic tech startup commercial, vertical 9:16',
  servicio: 'Packed restaurant on a Friday night, waiters gliding smoothly between tables with trays, orders flying to the kitchen without anyone writing on paper, timelapse energy with motion blur, camera crane shot descending into the room, modern dynamic hospitality commercial, vertical 9:16',
  cobro: 'Close-up of a diner tapping her phone on the table to pay the bill in seconds, confetti-like light particles burst from the screen, she stands up smiling and leaves while waiter waves, playful upbeat commercial style, fast cuts feel, vertical 9:16',
  // retrocompat con los tipos antiguos
  restaurante: 'Energetic young waiter in a busy Spanish tapas bar speaks into a smartphone while walking between crowded tables, the order instantly appears as glowing text on a sleek tablet at the kitchen pass, fast dolly camera following him, dynamic modern commercial style, shallow depth of field, vertical 9:16',
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

// El enlace de consulta lleva las URLs de cola que devolvió fal.ai al encolar
// (s = status_url, r = response_url) — la EF las usa tal cual, sin reconstruirlas.
function urlConsulta(data: Record<string, unknown>): string {
  const s = encodeURIComponent(String(data.statusUrl ?? ''))
  const r = encodeURIComponent(String(data.responseUrl ?? ''))
  return `/api/ig-ai-video?jobId=${data.requestId}&s=${s}&r=${r}`
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-story-secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams

  try {
    // Consulta de estado de un job existente
    const jobId = sp.get('jobId')
    if (jobId) {
      const { status, data } = await llamarEF({
        action: 'status',
        requestId: jobId,
        statusUrl: sp.get('s') || undefined,
        responseUrl: sp.get('r') || undefined,
      })
      return NextResponse.json(data, { status })
    }

    // Arrancar un job nuevo. ?engine=veo3-fast (default en la EF) | kling
    const tipo = sp.get('tipo') || 'restaurante'
    const prompt = sp.get('prompt') || PROMPTS[tipo] || PROMPTS['restaurante']
    const engine = sp.get('engine') || undefined
    const { status, data } = await llamarEF({ action: 'start', prompt, engine })
    if (status !== 200) return NextResponse.json(data, { status })
    return NextResponse.json({
      ok: true,
      jobId: data.requestId,
      modelo: data.modelo,
      engine: data.engine,
      tipo,
      prompt,
      consultar: urlConsulta(data),
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
    engine?: 'veo3-fast' | 'kling'
    jobId?: string
    statusUrl?: string
    responseUrl?: string
  }

  try {
    if (body.jobId) {
      const { status, data } = await llamarEF({
        action: 'status',
        requestId: body.jobId,
        statusUrl: body.statusUrl,
        responseUrl: body.responseUrl,
      })
      return NextResponse.json(data, { status })
    }

    const tipo = body.tipo || 'restaurante'
    const prompt = body.prompt || PROMPTS[tipo] || PROMPTS['restaurante']
    const { status, data } = await llamarEF({
      action: 'start',
      prompt,
      imageUrl: body.imageUrl,
      resolution: body.resolution,
      engine: body.engine,
    })
    if (status !== 200) return NextResponse.json(data, { status })
    return NextResponse.json({
      ok: true,
      jobId: data.requestId,
      modelo: data.modelo,
      engine: data.engine,
      tipo,
      prompt,
      consultar: urlConsulta(data),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
