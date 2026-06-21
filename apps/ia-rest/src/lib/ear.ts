import { notifyError } from '@/lib/notify'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 800

export interface TranscripcionResult {
  texto: string
  latencia_ms: number
  proveedor?: string
  /** Probabilidad media de que el audio sea ruido (0.0–1.0). null si no disponible. */
  no_speech_prob: number | null
  /** Log-probabilidad media de los tokens (cuanto más cercana a 0, más confianza). null si no disponible. */
  avg_logprob: number | null
}

/** Error especial para audio demasiado corto (PTT soltado sin hablar). No es un fallo real. */
export class AudioDemasiadoCortoError extends Error {
  constructor() {
    super('Audio demasiado corto — ignorar silenciosamente')
    this.name = 'AudioDemasiadoCortoError'
  }
}

/** Transcribe audio. Intenta Groq Whisper primero, fallback automático a OpenAI si falla. */
export async function transcribir(audioBlob: Blob, prompt?: string, idioma = 'es'): Promise<TranscripcionResult> {
  // ── Intentar Groq primero ──────────────────────────────────────────────────
  if (process.env.GROQ_API_KEY && process.env.EAR_PROVIDER !== 'openai') {
    try {
      const resultado = await transcribirConGroq(audioBlob, prompt, idioma)
      return { ...resultado, proveedor: 'groq' }
    } catch (err) {
      // Audio vacío → propagar directamente, sin fallback ni notificación
      if (err instanceof AudioDemasiadoCortoError) throw err

      const msg = err instanceof Error ? err.message : String(err)
      const esRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('limit')
      const esAuth      = msg.includes('401') || msg.includes('API key') || msg.includes('authentication')
      const esAudioCorto = msg.includes('too short') || msg.includes('Minimum audio length') || msg.includes('0.01 seconds')

      // Audio vacío (PTT soltado sin hablar) → lanzar error especial, sin fallback ni tgAlert
      if (esAudioCorto) {
        console.log('[EAR] Audio demasiado corto, ignorando silenciosamente')
        throw new AudioDemasiadoCortoError()
      }

      console.warn(`[EAR] Groq falló (${msg}) — activando fallback OpenAI`)

      notifyError({
        tipo: 'ear_groq_fallback',
        modulo: 'ear',
        mensaje: `Groq Whisper falló, usando OpenAI como fallback`,
        detalle: { error: msg, esRateLimit, esAuth },
        nivel: esAuth ? 'critico' : 'aviso',
      })

      if (!process.env.OPENAI_API_KEY) throw err
    }
  }

  // ── Fallback: OpenAI Whisper ───────────────────────────────────────────────
  try {
    const resultado = await transcribirConOpenAI(audioBlob, prompt, idioma)
    return { ...resultado, proveedor: 'openai' }
  } catch (err) {
    notifyError({
      tipo: 'ear_openai_fallback_fail',
      modulo: 'ear',
      mensaje: 'EAR completamente caído — Groq Y OpenAI fallaron',
      detalle: { error: String(err) },
      nivel: 'critico',
    })
    throw err
  }
}

// ── Groq Whisper ──────────────────────────────────────────────────────────────
async function transcribirConGroq(audioBlob: Blob, prompt?: string, idioma = 'es'): Promise<Omit<TranscripcionResult, 'proveedor'>> {
  const start = Date.now()
  const Groq = (await import('groq-sdk')).default
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const file = new File([audioBlob], 'audio.webm', { type: audioBlob.type })

      // verbose_json devuelve segments con no_speech_prob y avg_logprob
      // — métricas clave para detectar grabaciones con mucho ruido de fondo
      const transcripcion = await groq.audio.transcriptions.create({
        file,
        model:           'whisper-large-v3-turbo',
        ...(idioma !== 'auto' ? { language: idioma } : {}),
        response_format: 'verbose_json',
        ...(prompt ? { prompt } : {}),
      }) as unknown as {
        text: string
        segments?: Array<{ no_speech_prob?: number; avg_logprob?: number }>
      }

      // Calcular métricas medias de todos los segmentos
      const segs = transcripcion.segments ?? []
      const noSpeechProb = segs.length > 0
        ? segs.reduce((s, seg) => s + (seg.no_speech_prob ?? 0), 0) / segs.length
        : null
      const avgLogprob = segs.length > 0
        ? segs.reduce((s, seg) => s + (seg.avg_logprob ?? 0), 0) / segs.length
        : null

      return {
        texto:          transcripcion.text,
        latencia_ms:    Date.now() - start,
        no_speech_prob: noSpeechProb,
        avg_logprob:    avgLogprob,
      }
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[EAR/Groq] intento ${attempt}/${MAX_RETRIES}: ${msg}`)
      if (msg.includes('401') || msg.includes('API key') || msg.includes('authentication')) throw err
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt))
    }
  }
  throw lastError
}

// ── OpenAI Whisper (fallback) ─────────────────────────────────────────────────
async function transcribirConOpenAI(audioBlob: Blob, prompt?: string, idioma = 'es'): Promise<Omit<TranscripcionResult, 'proveedor'>> {
  const start = Date.now()
  const formData = new FormData()
  formData.append('file', new File([audioBlob], 'audio.webm', { type: audioBlob.type }))
  formData.append('model', 'whisper-1')
  if (idioma !== 'auto') formData.append('language', idioma)
  formData.append('response_format', 'verbose_json')
  if (prompt) formData.append('prompt', prompt)

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method:  'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body:    formData,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI Whisper error ${res.status}: ${text}`)
  }

  const data = await res.json() as {
    text: string
    segments?: Array<{ no_speech_prob?: number; avg_logprob?: number }>
  }

  const segs = data.segments ?? []
  const noSpeechProb = segs.length > 0
    ? segs.reduce((s, seg) => s + (seg.no_speech_prob ?? 0), 0) / segs.length
    : null
  const avgLogprob = segs.length > 0
    ? segs.reduce((s, seg) => s + (seg.avg_logprob ?? 0), 0) / segs.length
    : null

  return {
    texto:          data.text,
    latencia_ms:    Date.now() - start,
    no_speech_prob: noSpeechProb,
    avg_logprob:    avgLogprob,
  }
}
