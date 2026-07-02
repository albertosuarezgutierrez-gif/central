// Cliente de la Edge Function ig-video-gen (Supabase): generación de vídeo IA
// con fal.ai Kling, ASÍNCRONA. start encola y devuelve las URLs de la cola que
// da fal.ai; status las usa tal cual (nunca reconstruirlas — gotcha fal.ai).

export type VideoJob = {
  requestId: string
  statusUrl: string
  responseUrl: string
  modelo: string
}

export type VideoEstado =
  | { estado: 'IN_PROGRESS' | 'IN_QUEUE' }
  | { estado: 'COMPLETED'; videoUrl: string }
  | { estado: 'FAILED'; error: string }

async function llamarEF(body: Record<string, unknown>): Promise<Record<string, unknown>> {
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
  if (!res.ok) throw new Error(`ig-video-gen HTTP ${res.status}: ${String(data?.error ?? 'error')}`)
  return data
}

export async function startVideoIA(prompt: string, opts: { imageUrl?: string; duration?: number } = {}): Promise<VideoJob> {
  const data = await llamarEF({ action: 'start', prompt, imageUrl: opts.imageUrl, duration: opts.duration })
  if (typeof data.requestId !== 'string' || typeof data.statusUrl !== 'string' || typeof data.responseUrl !== 'string')
    throw new Error('ig-video-gen: start sin requestId/statusUrl')
  return { requestId: data.requestId, statusUrl: data.statusUrl, responseUrl: data.responseUrl, modelo: String(data.modelo ?? '') }
}

export async function checkVideoIA(job: Pick<VideoJob, 'statusUrl' | 'responseUrl'>): Promise<VideoEstado> {
  const data = await llamarEF({ action: 'status', statusUrl: job.statusUrl, responseUrl: job.responseUrl })
  const estado = String(data.estado ?? 'IN_PROGRESS')
  if (estado === 'COMPLETED' && typeof data.videoUrl === 'string') return { estado: 'COMPLETED', videoUrl: data.videoUrl }
  if (estado === 'FAILED') return { estado: 'FAILED', error: String(data.error ?? 'la generación falló') }
  return { estado: estado === 'IN_QUEUE' ? 'IN_QUEUE' : 'IN_PROGRESS' }
}

// Texto para overlay de Cloudinary: doble escape (la URL entera se vuelve a parsear)
// y sin caracteres que rompan la transformación (, / son separadores de Cloudinary).
function encodeTextoCloudinary(t: string): string {
  return encodeURIComponent(t.replace(/[,\/|]/g, ' ').trim()).replace(/%2C/gi, '%252C').replace(/%2F/gi, '%252F')
}

// Copia el MP4 de fal.ai a Cloudinary (las URLs de fal caducan en días) y devuelve
// la URL con el TÍTULO sobreimpreso (el 80% ve Reels sin sonido). Best-effort:
// si Cloudinary no está configurado o falla, devuelve la URL original de fal.
export async function videoConSubtitulo(videoUrl: string, titulo: string): Promise<string> {
  const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || ''
  const KEY = process.env.CLOUDINARY_API_KEY || ''
  const SEC = process.env.CLOUDINARY_API_SECRET || ''
  if (!CLOUD || !KEY || !SEC) return videoUrl
  try {
    // Subida por URL remota con basic auth (mismo patrón validado que ig-reel).
    const pid = `iarest_reel_ia_${Date.now()}`
    const form = new URLSearchParams({
      file: videoUrl,
      public_id: pid,
      overwrite: 'true',
      timestamp: String(Math.floor(Date.now() / 1000)),
    })
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${KEY}:${SEC}`).toString('base64'),
      },
      body: form.toString(),
      signal: AbortSignal.timeout(60_000),
    })
    const d = await res.json() as { public_id?: string; error?: { message: string } }
    if (d.error || !d.public_id) throw new Error(d.error?.message || 'sin public_id')
    // Marca siempre visible arriba (los modelos de vídeo no saben escribir texto
    // fiable, así que "ia.rest" se quema aquí, no en el prompt).
    const marca = `l_text:Arial_44_bold:ia.rest,co_white,b_rgb:E63946,bo_10px_solid_rgb:E63946,g_north,y_80`
    const texto = encodeTextoCloudinary(titulo)
    if (!texto) return `https://res.cloudinary.com/${CLOUD}/video/upload/${marca}/q_auto/${d.public_id}.mp4`
    // Título grande centrado abajo, blanco sobre banda oscura de marca.
    const overlay = `l_text:Arial_64_bold_center:${texto},co_white,b_rgb:14110E,w_920,c_fit,g_south,y_340`
    return `https://res.cloudinary.com/${CLOUD}/video/upload/${marca}/${overlay}/q_auto/${d.public_id}.mp4`
  } catch {
    return videoUrl
  }
}
