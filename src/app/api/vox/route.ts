import { NextRequest, NextResponse } from 'next/server'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { Readable } from 'stream'

const VOZ_DEFAULT = 'es-ES-ElviraNeural'

async function synthesize(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const { audioStream } = tts.toStream(text)
    const readable = audioStream as unknown as Readable
    readable.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    readable.on('end', () => resolve(Buffer.concat(chunks)))
    readable.on('error', reject)
  })
}

async function handler(req: NextRequest): Promise<NextResponse> {
  try {
    let text: string
    let voice: string = VOZ_DEFAULT
    if (req.method === 'GET') {
      text = req.nextUrl.searchParams.get('text') ?? 'ia.rest, el TPV del futuro.'
      voice = req.nextUrl.searchParams.get('voice') ?? VOZ_DEFAULT
    } else {
      const body = await req.json()
      text = body.text; voice = body.voice ?? VOZ_DEFAULT
    }
    if (!text?.trim()) return NextResponse.json({ error: 'text requerido' }, { status: 400 })
    const audioBuffer = await synthesize(String(text).slice(0, 300), voice)
    return new NextResponse(audioBuffer as unknown as BodyInit, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length.toString(), 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[VOX]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'TTS error' }, { status: 500 })
  }
}
export const POST = handler
export const GET = handler
