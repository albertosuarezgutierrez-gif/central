import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { aiExtractInvoice } from '@/lib/ai-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// La extracción vive en el helper compartido `aiExtractInvoice` (lib/ai-client): texto por
// Groq→NIM (con cadena de respaldo) e imagen por NIM visión. Antes este route tenía su propio
// `fetch` crudo a integrate.api.nvidia.com, duplicando el prompt y sin fallback (auditoría de
// enrutado 2026-07, PR-B). OCR/visión no pasan por OpenRouter/Director a propósito (clase de
// modelo distinta), pero sí por el helper único del monorepo.

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'Falta fichero' }, { status: 400 })

  const bytes    = await file.arrayBuffer()
  const buffer   = Buffer.from(bytes)
  const mimeType = file.type || 'application/octet-stream'

  try {
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
      if (!text.trim()) return NextResponse.json({ error: 'No se pudo extraer texto del PDF' }, { status: 422 })
      const data = await aiExtractInvoice({ text })
      return NextResponse.json({ ok: true, data, source: 'text' })
    }

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
