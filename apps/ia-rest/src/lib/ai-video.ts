// Cliente de la Edge Function ig-video-gen (Supabase): generación de vídeo IA
// con fal.ai Kling, ASÍNCRONA. start encola y devuelve las URLs de la cola que
// da fal.ai; status las usa tal cual (nunca reconstruirlas — gotcha fal.ai).

export type VideoEngine = 'veo3-fast' | 'kling'

export type VideoJob = {
  requestId: string
  statusUrl: string
  responseUrl: string
  modelo: string
  engine: string
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

export async function startVideoIA(
  prompt: string,
  opts: { imageUrl?: string; duration?: number; engine?: VideoEngine; generateAudio?: boolean } = {},
): Promise<VideoJob> {
  const data = await llamarEF({
    action: 'start',
    prompt,
    imageUrl: opts.imageUrl,
    duration: opts.duration,
    engine: opts.engine,
    generateAudio: opts.generateAudio,
  })
  if (typeof data.requestId !== 'string' || typeof data.statusUrl !== 'string' || typeof data.responseUrl !== 'string')
    throw new Error('ig-video-gen: start sin requestId/statusUrl')
  return {
    requestId: data.requestId,
    statusUrl: data.statusUrl,
    responseUrl: data.responseUrl,
    modelo: String(data.modelo ?? ''),
    engine: String(data.engine ?? ''),
  }
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

// Sube un asset a Cloudinary por URL remota con basic auth (patrón validado de
// ig-reel; la firma HMAC manual falla en esta cuenta). Devuelve el public_id.
async function subirACloudinary(
  cloud: string, key: string, sec: string,
  tipo: 'video' | 'image', fileUrl: string, publicId: string,
): Promise<string> {
  const form = new URLSearchParams({
    file: fileUrl,
    public_id: publicId,
    overwrite: 'true',
    timestamp: String(Math.floor(Date.now() / 1000)),
  })
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${tipo}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${key}:${sec}`).toString('base64'),
    },
    body: form.toString(),
    signal: AbortSignal.timeout(60_000),
  })
  const d = await res.json() as { public_id?: string; error?: { message: string } }
  if (d.error || !d.public_id) throw new Error(d.error?.message || 'sin public_id')
  return d.public_id
}

// Tarjeta de cierre de marca (últimos ~2s del Reel): el arte lo genera nuestro
// propio motor ig-img y se sube UNA VEZ a Cloudinary (el layer `l_fetch` está
// restringido en esta cuenta, así que el asset tiene que vivir dentro).
const ENDCARD_ID = 'iarest_endcard_v1'
async function ensureEndcard(cloud: string, key: string, sec: string): Promise<string | null> {
  try {
    const arte = 'https://www.iarest.es/api/ig-img?' + new URLSearchParams({
      tipo: 'cita',
      titulo: 'Facturar más ahora sí es ganar más.',
      sub: 'www.iarest.es',
    }).toString()
    return await subirACloudinary(cloud, key, sec, 'image', arte, ENDCARD_ID)
  } catch {
    return null
  }
}

// Copia el MP4 de fal.ai a Cloudinary (las URLs de fal caducan en días) y devuelve
// la URL con la marca "ia.rest" (watermark sutil arriba), el TÍTULO sobreimpreso
// (el 80% ve Reels sin sonido) y un CIERRE de marca de ~2s con el arte de ig-img.
// Best-effort: si Cloudinary no está configurado o falla, devuelve la URL de fal;
// si solo falla el cierre, devuelve la versión sin cierre.
export async function videoConSubtitulo(videoUrl: string, titulo: string): Promise<string> {
  const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || ''
  const KEY = process.env.CLOUDINARY_API_KEY || ''
  const SEC = process.env.CLOUDINARY_API_SECRET || ''
  if (!CLOUD || !KEY || !SEC) return videoUrl
  try {
    const [pid, endcard] = await Promise.all([
      subirACloudinary(CLOUD, KEY, SEC, 'video', videoUrl, `iarest_reel_ia_${Date.now()}`),
      ensureEndcard(CLOUD, KEY, SEC),
    ])
    const base = `https://res.cloudinary.com/${CLOUD}/video/upload`
    // LOGOTIPO ia.rest: chip de marca (caja roja + wordmark blanco) arriba-izquierda,
    // SIEMPRE visible (los modelos de vídeo no escriben texto fiable → se quema aquí).
    // Rojo de marca D9442B; los %20 dan aire al texto para que parezca un logo, no una etiqueta.
    const marca = `l_text:Arial_50_bold:%20ia.rest%20,co_white,b_rgb:D9442B,g_north_west,x_44,y_44`
    // Título grande centrado abajo, blanco sobre banda oscura de marca.
    const texto = encodeTextoCloudinary(titulo)
    const capas = [marca]
    if (texto) capas.push(`l_text:Arial_64_bold_center:${texto},co_white,b_rgb:14110E,w_920,c_fit,g_south,y_340`)
    // Cierre: la tarjeta (imagen) se empalma como clip de 2s al final del vídeo.
    const conCierre = endcard
      ? `${base}/${capas.join('/')}/fl_splice,l_${endcard}/c_fill,w_1080,h_1920,du_2.0/fl_layer_apply/q_auto/${pid}.mp4`
      : null
    const sinCierre = `${base}/${capas.join('/')}/q_auto/${pid}.mp4`
    // El splice puede fallar por sintaxis/limitaciones del plan → validar antes
    // de devolverlo (si la URL no renderiza, el Reel iría roto a Instagram).
    if (conCierre) {
      const ok = await fetch(conCierre, { method: 'HEAD', signal: AbortSignal.timeout(90_000) })
        .then(r => r.ok).catch(() => false)
      if (ok) return conCierre
    }
    return sinCierre
  } catch {
    return videoUrl
  }
}
