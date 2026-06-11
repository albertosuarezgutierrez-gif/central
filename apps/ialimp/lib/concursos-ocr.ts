// OCR de pliegos escaneados: rasteriza el PDF a PNG por página y los transcribe
// con la visión IA de la casa (nimVision). Solo se usa cuando pdf-parse no saca
// texto (necesitaOcr). Vive en la app (red/binarios/secretos).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { nimVision } from '@iarest/core-ai'

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || ''
const VISION_MODEL = 'meta/llama-3.2-90b-vision-instruct'

const TRANSCRIBE_SYS =
  'Eres un OCR experto en documentos administrativos españoles (pliegos de licitación).'
const TRANSCRIBE_USER =
  'Transcribe LITERALMENTE todo el texto de esta página, respetando saltos de línea y sin resumir, interpretar ni añadir nada.'

/** Rasteriza hasta `maxPaginas` páginas del PDF a PNG (base64). */
export async function rasterizarPdf(buffer: Buffer, maxPaginas = 12): Promise<string[]> {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise
  const out: string[] = []
  const n = Math.min(doc.numPages, maxPaginas)
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx as any, viewport }).promise
    out.push(canvas.toBuffer('image/png').toString('base64'))
  }
  return out
}

/** Extrae el texto de un PDF escaneado pasando cada página por nimVision. */
export async function ocrPaginasPliego(buffer: Buffer): Promise<string> {
  if (!NVIDIA_API_KEY) return ''
  const imagenes = await rasterizarPdf(buffer)
  const config = { apiKey: NVIDIA_API_KEY, visionModel: VISION_MODEL }
  const partes: string[] = []
  for (const data of imagenes) {
    try {
      const txt = await nimVision(config, TRANSCRIBE_SYS, [{ data, mediaType: 'image/png' }], TRANSCRIBE_USER)
      if (txt) partes.push(txt)
    } catch { /* una página fallida no tumba el resto */ }
  }
  return partes.join('\n\n').trim()
}
