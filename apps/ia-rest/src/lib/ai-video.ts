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
