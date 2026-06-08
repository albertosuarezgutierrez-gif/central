/**
 * ai-client.ts — Wrapper IA unificado para SIVRA
 * Proveedor único: NVIDIA NIM (gratis, meta/llama-3.3-70b-instruct)
 */

const NVIDIA_BASE    = 'https://integrate.api.nvidia.com/v1'
const NVIDIA_MODEL   = 'meta/llama-3.3-70b-instruct'
const NVIDIA_VISION  = 'meta/llama-3.2-90b-vision-instruct'
const TIMEOUT_MS     = 25_000

export interface AiMessage {
  role:    'user' | 'assistant'
  content: string
}

export interface AiOptions {
  system?:      string
  maxTokens?:   number
  temperature?: number
  model?:       string   // override del modelo NVIDIA
}

function nvidiaKey(): string {
  const k = process.env.NVIDIA_API_KEY
  if (!k) throw new Error('NVIDIA_API_KEY no configurada en Vercel')
  return k
}

/**
 * Genera una completion de texto con NVIDIA NIM.
 */
export async function aiComplete(
  messages:  AiMessage[],
  options:   AiOptions = {}
): Promise<string> {
  const { system, maxTokens = 800, temperature = 0.3, model } = options

  const nvidiaMessages = [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    ...messages,
  ]

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${nvidiaKey()}`,
    },
    body: JSON.stringify({
      model:       model || NVIDIA_MODEL,
      messages:    nvidiaMessages,
      max_tokens:  maxTokens,
      temperature,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`NVIDIA ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content as string | undefined
  if (!text?.trim()) throw new Error('NVIDIA: respuesta vacía')

  console.log('[ai] provider=nvidia model=' + (model || NVIDIA_MODEL))
  return text
}

// ─── Invoice extraction ───────────────────────────────────────────────────────

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
  const key = nvidiaKey()

  // ── Imagen: modelo visión ────────────────────────────────────────────────
  if (input.imageBase64 && input.mimeType) {
    const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model:       NVIDIA_VISION,
        max_tokens:  512,
        temperature: 0.1,
        messages: [{
          role:    'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` } },
            { type: 'text',      text: INVOICE_SYSTEM + '\n\nExtrae los datos de esta factura en JSON:' }
          ]
        }]
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`NVIDIA vision ${res.status}`)
    const data  = await res.json()
    const txt   = data.choices?.[0]?.message?.content || '{}'
    const clean = txt.replace(/```json|```/g, '').trim()
    try { return JSON.parse(clean) } catch { return {} }
  }

  // ── Texto (PDF extraído): modelo texto ───────────────────────────────────
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
