// Cliente fal.ai — generación de vídeo con IA (WAN 2.1, text-to-video e image-to-video).
// Identity-agnostic: la config (apiKey) la inyecta siempre la app consumidora.

export type FalConfig = {
  apiKey: string
}

export type FalVideoOpts = {
  duration?: number              // segundos, 1-10 (default 5)
  aspectRatio?: '9:16' | '16:9' | '1:1'  // default '9:16' (vertical Instagram)
  resolution?: '480p' | '720p' | '1080p'  // default '720p'
  negativePrompt?: string
}

type FalQueueResult = {
  request_id: string
  status_url: string
  response_url: string
}

type FalStatus = {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
}

type FalVideoResponse = {
  video: { url: string; content_type: string; file_name: string; file_size: number }
}

async function enqueue(config: FalConfig, path: string, body: unknown): Promise<FalQueueResult> {
  const res = await fetch(`https://queue.fal.run${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`fal.ai enqueue ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<FalQueueResult>
}

async function pollResult(config: FalConfig, statusUrl: string, responseUrl: string, maxMs = 90_000): Promise<FalVideoResponse> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500))
    const sRes = await fetch(statusUrl, { headers: { Authorization: `Key ${config.apiKey}` } })
    const { status } = await sRes.json() as FalStatus
    if (status === 'COMPLETED') {
      const rRes = await fetch(responseUrl, { headers: { Authorization: `Key ${config.apiKey}` } })
      return rRes.json() as Promise<FalVideoResponse>
    }
    if (status === 'FAILED') throw new Error('fal.ai: la generación de vídeo falló')
  }
  throw new Error('fal.ai: timeout esperando el vídeo')
}

// Genera un vídeo desde texto. Devuelve la URL del MP4 ya renderizado.
export async function falTextToVideo(config: FalConfig, prompt: string, opts: FalVideoOpts = {}): Promise<string> {
  const queued = await enqueue(config, '/fal-ai/wan/v2.1/text-to-video', {
    prompt,
    duration: opts.duration ?? 5,
    aspect_ratio: opts.aspectRatio ?? '9:16',
    resolution: opts.resolution ?? '720p',
    ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
  })
  const result = await pollResult(config, queued.status_url, queued.response_url)
  return result.video.url
}

// Genera un vídeo animando una imagen existente. Devuelve la URL del MP4.
export async function falImageToVideo(config: FalConfig, imageUrl: string, prompt: string, opts: FalVideoOpts = {}): Promise<string> {
  const queued = await enqueue(config, '/fal-ai/wan/v2.1/image-to-video', {
    image_url: imageUrl,
    prompt,
    duration: opts.duration ?? 5,
    aspect_ratio: opts.aspectRatio ?? '9:16',
    resolution: opts.resolution ?? '720p',
  })
  const result = await pollResult(config, queued.status_url, queued.response_url)
  return result.video.url
}
