/**
 * ai-client.ts — Wrapper IA para SIVRA
 * Enruta por la PASARELA central (plataforma): las keys de proveedor y el control de coste/uso
 * viven en plataforma. Si la pasarela no está configurada (sin AI_GATEWAY_URL+SECRET), usa NVIDIA
 * NIM directo (fallback de transición). `aiExtractInvoice` (facturas) se mantiene aquí.
 */
import {
  aiComplete as _aiComplete, nimVision,
  gatewayChat, gatewayVision, gatewaySearch,
  type NimConfig, type GatewayConfig,
} from '@central/core-ai'

const APP = 'sivra'
const NVIDIA_VISION = 'meta/llama-3.2-90b-vision-instruct'

function gatewayCfg(): GatewayConfig | null {
  const url = process.env.AI_GATEWAY_URL
  const secret = process.env.AI_GATEWAY_SECRET
  return url && secret ? { url, secret, app: APP } : null
}

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
  const cfg = gatewayCfg()
  if (cfg) return gatewayChat(cfg, messages, { system, model, maxTokens, timeoutMs })
  return _aiComplete(messages, { system, maxTokens, temperature, timeoutMs, model })
}

/**
 * Búsqueda web + síntesis a través de la pasarela central (Gemini + Google Search por debajo).
 * Usar para tareas que necesitan datos actuales de internet (p. ej. análisis SEO de competencia).
 * Sin pasarela configurada cae a NIM puro (texto, SIN búsqueda web real) como último recurso.
 */
export async function aiSearch(
  system: string,
  user: string,
  options: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { maxTokens = 1500, timeoutMs = 45_000 } = options
  const cfg = gatewayCfg()
  if (cfg) return gatewaySearch(cfg, system, user, { maxTokens, timeoutMs })
  return _aiComplete([{ role: 'user', content: user }], { system, maxTokens, timeoutMs })
}

/** Visión / OCR: pasarela si está configurada; si no, NIM directo. */
async function visionExtraer(system: string, imageBase64: string, mimeType: string): Promise<string> {
  const cfg = gatewayCfg()
  const images = [{ data: imageBase64, mediaType: mimeType }]
  if (cfg) return gatewayVision(cfg, system, images, 'Extrae los datos de esta factura en JSON:', { maxTokens: 512, model: NVIDIA_VISION })
  return nimVision(nimConfig(), system, images, 'Extrae los datos de esta factura en JSON:', 512, { signal: AbortSignal.timeout(30_000) })
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
 * PDF  → texto plano → NVIDIA NIM llama-4-maverick
 * Imagen → base64   → NVIDIA NIM llama-3.2-90b-vision
 */
export async function aiExtractInvoice(input: {
  text?:         string
  imageBase64?:  string
  mimeType?:     string
}): Promise<Record<string, any>> {
  // ── Imagen: modelo visión ────────────────────────────────────────────
  if (input.imageBase64 && input.mimeType) {
    const txt = await visionExtraer(INVOICE_SYSTEM, input.imageBase64, input.mimeType)
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
