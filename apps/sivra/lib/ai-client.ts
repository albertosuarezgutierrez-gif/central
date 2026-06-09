/**
 * ai-client.ts — Wrapper IA para SIVRA
 * `aiComplete` delega en @iarest/core-ai.
 * `aiExtractInvoice` es específico de SIVRA (extrae facturas) y se mantiene aquí.
 */
import { aiComplete as _aiComplete, nimVision, type NimConfig } from '@iarest/core-ai'

const NVIDIA_VISION = 'meta/llama-3.2-90b-vision-instruct'

function nimConfig(): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada en Vercel')
  return { apiKey, visionModel: NVIDIA_VISION }
}

export interface AiMessage {
  role:    'user' | 'assistant'
  content: string
}

export interface AiOptions {
  system?:      string
  maxTokens?:   number
  temperature?: number
  timeoutMs?:   number
  model?:       string
}

export async function aiComplete(
  messages: AiMessage[],
  options:  AiOptions = {}
): Promise<string> {
  const { system, maxTokens = 800, temperature = 0.3, timeoutMs = 25_000, model } = options
  return _aiComplete(messages, { system, maxTokens, temperature, timeoutMs, model })
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
  "total": 0.00,
  "categoria": "LIMPIEZA|MANTENIMIENTO|SUMINISTROS|COMUNIDAD|SEGURO|IMPUESTOS|PLATAFORMAS|MOBILIARIO|REFORMAS|OTRO"
}
Reglas: fecha formato YYYY-MM-DD. Números decimales con punto. categoria según el tipo de gasto.
Si no encuentras un campo, pon null. Solo JSON, sin texto adicional.`

/**
 * Extrae datos estructurados de una factura.
 * PDF  → texto plano → NVIDIA NIM llama-3.3-70b
 * Imagen → base64   → NVIDIA NIM llama-3.2-90b-vision
 */
export async function aiExtractInvoice(input: {
  text?:         string
  imageBase64?:  string
  mimeType?:     string
}): Promise<Record<string, any>> {
  // ── Imagen: modelo visión ────────────────────────────────────────────
  if (input.imageBase64 && input.mimeType) {
    const txt = await nimVision(
      nimConfig(),
      INVOICE_SYSTEM,
      [{ data: input.imageBase64, mediaType: input.mimeType }],
      'Extrae los datos de esta factura en JSON:',
      512,
      { signal: AbortSignal.timeout(30_000) },
    )
    const clean = txt.replace(/```json|```/g, '').trim()
    try { return JSON.parse(clean) } catch { return {} }
  }

  // ── Texto (PDF extraído): modelo texto ─────────────────────────────────
  if (input.text) {
    const txt   = await aiComplete(
      [{ role: 'user', content: `Factura:\n${input.text.slice(0, 4000)}` }],
      { system: INVOICE_SYSTEM, maxTokens: 512, temperature: 0.1 }
    )
    const clean = txt.replace(/```json|```/g, '').trim()
    try { return JSON.parse(clean) } catch { return {} }
  }

  return {}
}
