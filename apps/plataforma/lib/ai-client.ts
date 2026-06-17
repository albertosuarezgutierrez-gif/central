/**
 * ai-client.ts — Wrapper IA para plataforma (gateway directo).
 * Plataforma ES la pasarela central, por lo que llama directamente a @central/core-ai
 * sin necesidad de enrutar por HTTP. NVIDIA_API_KEY en Vercel env.
 */
import { nimChat, nimVision, type NimConfig } from '@central/core-ai'

const NVIDIA_TEXT  = 'meta/llama-3.3-70b-instruct'
const NVIDIA_VISION = 'meta/llama-3.2-90b-vision-instruct'

function nimConfig(): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada en Vercel')
  return { apiKey, visionModel: NVIDIA_VISION }
}

// ─── Invoice extraction ───────────────────────────────────────────────

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
Reglas: fecha formato YYYY-MM-DD. Números decimales con punto. categoria según el tipo de gasto.
Si es un recibo o adeudo de ALQUILER de local/vivienda con retención de IRPF, rellena "irpf" con el
importe RETENIDO en positivo (p.ej. 57.63) e "irpf_porcentaje" (p.ej. 19); normalmente
total = base_imponible + iva - irpf. Si no hay retención, irpf=0 e irpf_porcentaje=0.
Si no encuentras un campo, pon null. Solo JSON, sin texto adicional.`

/**
 * Extrae datos estructurados de una factura.
 * PDF  → texto plano → NVIDIA NIM llama-3.3-70b
 * Imagen → base64   → NVIDIA NIM llama-3.2-90b-vision
 */
export async function aiExtractInvoice(input: {
  text?:        string
  imageBase64?: string
  mimeType?:    string
}): Promise<Record<string, any>> {
  const cfg = nimConfig()

  // ── Imagen: modelo visión ────────────────────────────────────────────
  if (input.imageBase64 && input.mimeType) {
    const images = [{ data: input.imageBase64, mediaType: input.mimeType }]
    const txt = await nimVision(cfg, INVOICE_SYSTEM, images, 'Extrae los datos de esta factura en JSON:', 512, { signal: AbortSignal.timeout(30_000) })
    const clean = txt.replace(/```json|```/g, '').trim()
    try { return JSON.parse(clean) } catch { return {} }
  }

  // ── Texto (PDF extraído): modelo texto ─────────────────────────────────
  if (input.text) {
    const messages = [
      { role: 'system' as const, content: INVOICE_SYSTEM },
      { role: 'user' as const, content: `Factura:\n${input.text.slice(0, 4000)}` },
    ]
    const txt = await nimChat(
      { apiKey: cfg.apiKey, textModel: NVIDIA_TEXT },
      messages,
      { maxTokens: 512, temperature: 0.1, signal: AbortSignal.timeout(25_000) },
    )
    const clean = txt.replace(/```json|```/g, '').trim()
    try { return JSON.parse(clean) } catch { return {} }
  }

  return {}
}
