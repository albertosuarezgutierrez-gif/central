// v3 — Generación de vídeo IA (fal.ai WAN 2.1) para Instagram. ASÍNCRONA.
// fal.ai tarda 1-5 min y ningún caller síncrono aguanta tanto (Vercel corta a ~60-110s),
// así que la EF expone dos acciones rápidas:
//   action=start  → encola en fal.ai y devuelve { requestId } al instante
//   action=status → consulta el estado; si terminó devuelve { videoUrl }
// Auth: header x-story-secret == CRON_SECRET (Supabase secret).
// Secrets requeridos: FAL_API_KEY, CRON_SECRET.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-story-secret',
}

const MODEL_T2V = 'fal-ai/wan-t2v'
const MODEL_I2V = 'fal-ai/wan-i2v'

type FalVideoResponse = {
  video?: { url?: string }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-story-secret') !== cronSecret) {
    return json({ error: 'No autorizado' }, 401)
  }

  const apiKey = Deno.env.get('FAL_API_KEY')
  if (!apiKey) return json({ error: 'FAL_API_KEY no configurada en Supabase secrets' }, 503)

  const falHeaders = { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' }

  try {
    const body = await req.json().catch(() => ({})) as {
      action?: 'start' | 'status'
      requestId?: string
      modelo?: string
      prompt?: string
      imageUrl?: string
      aspectRatio?: '9:16' | '16:9' | '1:1'
      resolution?: '480p' | '720p' | '1080p'
    }

    // ── action=status ────────────────────────────────────────────────
    if (body.action === 'status') {
      const requestId = String(body.requestId ?? '').trim()
      const modelo = body.modelo === MODEL_I2V ? MODEL_I2V : MODEL_T2V
      if (!requestId) return json({ error: 'Falta requestId' }, 400)

      const sRes = await fetch(`https://queue.fal.run/${modelo}/requests/${requestId}/status`, { headers: falHeaders })
      const statusData = await sRes.json() as { status?: string; output?: FalVideoResponse }
      if (!sRes.ok) return json({ error: `fal.ai status HTTP ${sRes.status}: ${JSON.stringify(statusData).slice(0, 200)}` }, 502)

      if (statusData.status === 'FAILED') return json({ ok: false, estado: 'FAILED', error: 'fal.ai: la generación de vídeo falló' })
      if (statusData.status !== 'COMPLETED') return json({ ok: true, estado: statusData.status ?? 'IN_PROGRESS' })

      if (statusData.output?.video?.url) return json({ ok: true, estado: 'COMPLETED', videoUrl: statusData.output.video.url })
      const rRes = await fetch(`https://queue.fal.run/${modelo}/requests/${requestId}`, { headers: falHeaders })
      const raw = await rRes.json() as FalVideoResponse & { data?: FalVideoResponse }
      const url = raw?.data?.video?.url ?? raw?.video?.url
      if (!url) return json({ error: `fal.ai: respuesta inesperada: ${JSON.stringify(raw).slice(0, 200)}` }, 502)
      return json({ ok: true, estado: 'COMPLETED', videoUrl: url })
    }

    // ── action=start (default) ───────────────────────────────────────
    const prompt = String(body?.prompt ?? '').trim()
    if (!prompt) return json({ error: 'Falta prompt' }, 400)

    const modelo = body?.imageUrl ? MODEL_I2V : MODEL_T2V
    const payload = {
      prompt,
      aspect_ratio: body?.aspectRatio ?? '9:16',
      resolution: body?.resolution ?? '720p',
      ...(body?.imageUrl ? { image_url: body.imageUrl } : {}),
    }

    const eRes = await fetch(`https://queue.fal.run/${modelo}`, {
      method: 'POST',
      headers: falHeaders,
      body: JSON.stringify(payload),
    })
    if (!eRes.ok) {
      const text = await eRes.text().catch(() => '')
      return json({ error: `fal.ai enqueue ${modelo} → ${eRes.status}: ${text.slice(0, 200)}` }, 502)
    }
    const queued = await eRes.json() as { request_id?: string }
    if (!queued.request_id) return json({ error: 'fal.ai: enqueue sin request_id' }, 502)

    return json({ ok: true, requestId: queued.request_id, modelo })
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
})
