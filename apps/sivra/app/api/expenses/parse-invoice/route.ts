import { NextRequest, NextResponse } from 'next/server'
import { aiExtractInvoice } from '@/lib/ai-client'

export const dynamic   = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0)
      return NextResponse.json({ error: 'Falta fichero' }, { status: 400 })

    const bytes    = await file.arrayBuffer()
    const buffer   = Buffer.from(bytes)
    const mimeType = file.type || 'application/octet-stream'

    // ── PDF: extraer texto con pdf-parse ────────────────────────────────────
    if (mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      let text = ''
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse')
        const parsed   = await pdfParse(buffer)
        text = parsed.text || ''
      } catch (e) {
        console.warn('[parse-invoice] pdf-parse error:', e)
      }

      if (!text.trim())
        return NextResponse.json({ error: 'No se pudo extraer texto del PDF' }, { status: 422 })

      const data = await aiExtractInvoice({ text })
      return NextResponse.json({ ok: true, data, source: 'text' })
    }

    // ── Imagen: enviar a modelo de visión ───────────────────────────────────
    if (mimeType.startsWith('image/')) {
      const imageBase64 = buffer.toString('base64')
      const data = await aiExtractInvoice({ imageBase64, mimeType })
      return NextResponse.json({ ok: true, data, source: 'vision' })
    }

    return NextResponse.json({ error: 'Formato no soportado (PDF o imagen)' }, { status: 400 })

  } catch (e: any) {
    console.error('[parse-invoice]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
