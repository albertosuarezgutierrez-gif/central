import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const INVOICE_SYSTEM = `Eres un extractor de datos de facturas españolas.
Analiza el texto o imagen de la factura y devuelve SOLO JSON sin markdown:
{
  "fecha": "YYYY-MM-DD",
  "proveedor": "nombre empresa emisora",
  "nif_proveedor": "NIF/CIF si aparece",
  "concepto": "descripción del servicio/producto",
  "numero_factura": "número de factura si aparece",
  "base_imponible": 0.00,
  "iva_porcentaje": 21,
  "iva": 0.00,
  "irpf_porcentaje": 0,
  "irpf": 0.00,
  "total": 0.00,
  "categoria": "ALQUILER|LIMPIEZA|MANTENIMIENTO|SUMINISTROS|COMUNIDAD|SEGURO|IMPUESTOS|PLATAFORMAS|MOBILIARIO|REFORMAS|OTRO"
}
Reglas: fecha formato YYYY-MM-DD. Números decimales con punto. Si no encuentras un campo, pon null. Solo JSON, sin texto adicional.`

async function extractWithNim(prompt: string, imageBase64?: string, mimeType?: string): Promise<Record<string, any>> {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')

  let messages: any[]
  if (imageBase64 && mimeType) {
    messages = [{
      role: 'user',
      content: [
        { type: 'text', text: INVOICE_SYSTEM + '\nExtrae los datos de esta factura en JSON:' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    }]
  } else {
    messages = [
      { role: 'system', content: INVOICE_SYSTEM },
      { role: 'user', content: `Factura:\n${prompt.slice(0, 4000)}` },
    ]
  }

  const model = imageBase64 ? 'meta/llama-3.2-90b-vision-instruct' : 'meta/llama-3.3-70b-instruct'
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 512, temperature: 0.1 }),
    signal: AbortSignal.timeout(30_000),
  })
  const json = await res.json()
  const txt = json.choices?.[0]?.message?.content ?? ''
  const clean = txt.replace(/```json|```/g, '').trim()
  try { return JSON.parse(clean) } catch { return {} }
}

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
      const data = await extractWithNim(text)
      return NextResponse.json({ ok: true, data, source: 'text' })
    }

    if (mimeType.startsWith('image/')) {
      const imageBase64 = buffer.toString('base64')
      const data = await extractWithNim('', imageBase64, mimeType)
      return NextResponse.json({ ok: true, data, source: 'vision' })
    }

    return NextResponse.json({ error: 'Formato no soportado (PDF o imagen)' }, { status: 400 })
  } catch (e: any) {
    console.error('[parse-invoice]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
