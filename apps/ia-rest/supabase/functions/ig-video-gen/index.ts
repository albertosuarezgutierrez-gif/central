// v6 — Generación de vídeo IA (fal.ai Kling 2.1) para Instagram. ASÍNCRONA.
// fal.ai tarda 1-5 min y ningún caller síncrono aguanta tanto, así que la EF
// expone dos acciones rápidas:
//   action=start  → encola en fal.ai; devuelve { requestId, statusUrl, responseUrl }
//   action=status → consulta el estado usando las URLs que dio fal.ai al encolar
//                   (NUNCA reconstruirlas a mano: los modelos anidados como
//                   fal-ai/kling-video/v2.1/... usan otra estructura de cola).
// Auth: header x-story-secret == CRON_SECRET (Supabase secret).
// Secrets requeridos: FAL_API_KEY, CRON_SECRET.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-story-secret',
}

// Kling 2.5-turbo/pro: v2.1 standard NO existe para text-to-video (solo i2v).
const MODEL_T2V = 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video'
const MODEL_I2V = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'

type FalVideoResponse = {
  video?: { url?: string }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Solo aceptamos URLs de la cola oficial de fal.ai (el caller nos las reenvía).
function urlDeFal(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' && u.hostname === 'queue.fal.run' ? u.toString() : null
  } catch {
    return null
  }
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
      statusUrl?: string
      responseUrl?: string
      modelo?: string
      prompt?: string
      imageUrl?: string
      duration?: number
      aspectRatio?: '9:16' | '16:9' | '1:1'
    }

    // ── action=status ────────────────────────────────────────────────
    if (body.action === 'status') {
      const statusUrl = urlDeFal(body.statusUrl)
      const responseUrl = urlDeFal(body.responseUrl)
      if (!statusUrl || !responseUrl) return json({ error: 'Faltan statusUrl/responseUrl (rearranca el job)' }, 400)

      const sRes = await fetch(statusUrl, { headers: falHeaders })
      const statusData = await sRes.json() as { status?: string; output?: FalVideoResponse }
      if (!sRes.ok) return json({ error: `fal.ai status HTTP ${sRes.status}: ${JSON.stringify(statusData).slice(0, 200)}` }, 502)

      if (statusData.status === 'FAILED') return json({ ok: false, estado: 'FAILED', error: 'fal.ai: la generación de vídeo falló' })
      if (statusData.status !== 'COMPLETED') return json({ ok: true, estado: statusData.status ?? 'IN_PROGRESS' })

      if (statusData.output?.video?.url) return json({ ok: true, estado: 'COMPLETED', videoUrl: statusData.output.video.url })
      const rRes = await fetch(responseUrl, { headers: falHeaders })
      const raw = await rRes.json() as FalVideoResponse & { data?: FalVideoResponse }
      const url = raw?.data?.video?.url ?? raw?.video?.url
      if (!url) return json({ error: `fal.ai: respuesta inesperada: ${JSON.stringify(raw).slice(0, 200)}` }, 502)
      return json({ ok: true, estado: 'COMPLETED', videoUrl: url })
    }

    // ── action=start (default) ───────────────────────────────────────
    const prompt = String(body?.prompt ?? '').trim()
    if (!prompt) return json({ error: 'Falta prompt' }, 400)

    const modelo = body?.imageUrl ? MODEL_I2V : MODEL_T2V
    // Kling: duration como string '5'|'10'; no acepta resolution.
    const payload = {
      prompt,
      duration: String(body?.duration === 10 ? 10 : 5),
      aspect_ratio: body?.aspectRatio ?? '9:16',
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
    const queued = await eRes.json() as { request_id?: string; status_url?: string; response_url?: string }
    if (!queued.request_id || !queued.status_url || !queued.response_url) {
      return json({ error: `fal.ai: enqueue sin request_id/status_url: ${JSON.stringify(queued).slice(0, 200)}` }, 502)
    }

    return json({
      ok: true,
      requestId: queued.request_id,
      statusUrl: queued.status_url,
      responseUrl: queued.response_url,
      modelo,
    })
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
})
