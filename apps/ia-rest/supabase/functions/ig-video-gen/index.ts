// v2 — Generación de vídeo IA (fal.ai WAN 2.1) para Instagram.
// Vive en Edge Function porque fal.ai tarda 60-180s y Vercel corta ia-rest a ~60s.
// Auth: header x-story-secret == CRON_SECRET (Supabase secret).
// Secrets requeridos: FAL_API_KEY, CRON_SECRET.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-story-secret',
}

type FalQueueResult = {
  request_id: string
  status_url: string
  response_url: string
}

type FalVideoResponse = {
  video?: { url?: string }
}

async function enqueue(apiKey: string, path: string, body: unknown): Promise<FalQueueResult> {
  const res = await fetch(`https://queue.fal.run${path}`, {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`fal.ai enqueue ${path} → ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<FalQueueResult>
}

async function pollResult(apiKey: string, statusUrl: string, responseUrl: string, maxMs = 300_000): Promise<string> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000))
    const sRes = await fetch(statusUrl, { headers: { Authorization: `Key ${apiKey}` } })
    const statusData = await sRes.json() as { status: string; output?: FalVideoResponse }
    if (statusData.status === 'COMPLETED') {
      if (statusData.output?.video?.url) return statusData.output.video.url
      const rRes = await fetch(responseUrl, { headers: { Authorization: `Key ${apiKey}` } })
      const raw = await rRes.json() as FalVideoResponse & { data?: FalVideoResponse }
      const url = raw?.data?.video?.url ?? raw?.video?.url
      if (!url) throw new Error(`fal.ai: respuesta inesperada: ${JSON.stringify(raw).slice(0, 200)}`)
      return url
    }
    if (statusData.status === 'FAILED') throw new Error('fal.ai: la generación de vídeo falló')
  }
  throw new Error('fal.ai: timeout esperando el vídeo')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-story-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('FAL_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'FAL_API_KEY no configurada en Supabase secrets' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      prompt?: string
      imageUrl?: string
      duration?: number
      aspectRatio?: '9:16' | '16:9' | '1:1'
      resolution?: '480p' | '720p' | '1080p'
    }

    const prompt = String(body?.prompt ?? '').trim()
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Falta prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Rutas reales de WAN 2.1 en fal.ai: wan-t2v / wan-i2v (sin campo duration).
    const payload = {
      prompt,
      aspect_ratio: body?.aspectRatio ?? '9:16',
      resolution: body?.resolution ?? '720p',
      ...(body?.imageUrl ? { image_url: body.imageUrl } : {}),
    }
    const path = body?.imageUrl ? '/fal-ai/wan-i2v' : '/fal-ai/wan-t2v'

    const queued = await enqueue(apiKey, path, payload)
    const videoUrl = await pollResult(apiKey, queued.status_url, queued.response_url)

    return new Response(JSON.stringify({ ok: true, videoUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
