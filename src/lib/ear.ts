import { BinaryLike } from 'crypto'

export async function transcribir(audioBlob: Blob): Promise<{ texto: string; latencia_ms: number }> {
  const start = Date.now()

  // Lazy import - only loads at runtime, not build time
  const Groq = (await import('groq-sdk')).default
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })

  const file = new File([audioBlob], 'audio.webm', { type: audioBlob.type })

  const transcripcion = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
    language: 'es',
    response_format: 'json',
  })

  return {
    texto: transcripcion.text,
    latencia_ms: Date.now() - start,
  }
}
