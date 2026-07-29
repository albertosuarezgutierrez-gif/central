/**
 * ai-client.ts — Wrapper IA para plataforma (gateway directo).
 * Plataforma ES la pasarela central, por lo que llama directamente a @central/core-ai
 * sin necesidad de enrutar por HTTP. NVIDIA_API_KEY en Vercel env.
 */
import { nimChat, nimVision, groqText, groqTranscribe, type NimConfig, type NimChatMessage } from '@central/core-ai'
import { chatConDirector } from '@/lib/pasarela'

const NVIDIA_TEXT  = 'meta/llama-3.3-70b-instruct'
const NVIDIA_VISION = 'meta/llama-3.2-90b-vision-instruct'

function nimConfig(): NimConfig {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada en Vercel')
  return { apiKey, visionModel: NVIDIA_VISION }
}

/**
 * Completion de texto (system+user…). Mismo contrato de siempre: recibe mensajes
 * {role,content} y devuelve el texto.
 *
 * Antes iba DIRECTO a NVIDIA NIM con modelo pinneado (Llama 3.3-70b), saltándose
 * OpenRouter y el Agente Director. Ahora enruta por `chatConDirector` (la pasarela):
 * con `OPENROUTER_API_KEY` el Director elige el mejor modelo por petición (+ fallback
 * nativo entre modelos); sin ella cae a la cadena clásica GRATIS de siempre
 * (NIM → Groq → Gemini → Kimi). Degrada, nunca muere; lanza solo si TODO falla.
 * (Auditoría de enrutado 2026-07 — PR-A: rescatar las ~10 rutas que bypaseaban.)
 */
export async function aiComplete(
  messages: { role: string; content: string }[],
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const { text } = await chatConDirector(messages as NimChatMessage[], {
    app: 'plataforma',
    endpoint: 'ai-client',
    // Mismo techo de salida que la implementación NIM directa anterior.
    maxTokens: 2048,
    timeoutMs: opts.timeoutMs ?? 20_000,
  })
  return text
}

/**
 * Transcribe voz → texto (STT) con Groq Whisper (`whisper-large-v3`, gratis).
 * Usa GROQ_API_KEY (la misma del fallback de texto). Devuelve '' si no reconoce nada.
 * Para las notas de voz del agente de contabilidad por Telegram.
 */
export async function aiTranscribe(
  audio: Buffer, fileName: string, mimeType?: string, opts: { timeoutMs?: number } = {},
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada (necesaria para transcribir voz)')
  return groqTranscribe(
    { apiKey },
    { data: audio, fileName, mimeType },
    { language: 'es', signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) },
  )
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

// Corta una llamada colgada (Groq no acepta `signal`, y NIM se ha colgado antes).
function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('ia-timeout')), ms)),
  ])
}

// Extracción por Groq (rápido, mismo Llama-70b). Lanza si no hay GROQ_API_KEY o Groq falla.
async function extraerConGroq(user: string): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('sin GROQ_API_KEY')
  return conTimeout(groqText({ apiKey: key }, INVOICE_SYSTEM, user, 512), 15_000)
}

/**
 * Extrae datos estructurados de una factura. Devuelve {} si NINGÚN modelo logra leerla
 * (el llamador lo trata como "no legible" y avisa, en vez de tragárselo en silencio).
 * PDF (texto)   → Groq (rápido) → NVIDIA NIM (respaldo)   — el 1er JSON válido gana.
 * Imagen        → NVIDIA NIM visión (llama-3.2-90b).
 */
export async function aiExtractInvoice(input: {
  text?:        string
  imageBase64?: string
  mimeType?:    string
}): Promise<Record<string, any>> {
  // ── Imagen: modelo visión ────────────────────────────────────────────
  if (input.imageBase64 && input.mimeType) {
    const images = [{ data: input.imageBase64, mediaType: input.mimeType }]
    const txt = await nimVision(nimConfig(), INVOICE_SYSTEM, images, 'Extrae los datos de esta factura en JSON:', 512, { signal: AbortSignal.timeout(30_000) })
    const clean = txt.replace(/```json|```/g, '').trim()
    try { return JSON.parse(clean) } catch { return {} }
  }

  // ── Texto (PDF extraído): Groq → NIM ───────────────────────────────────
  // La extracción era la ÚNICA llamada IA de la app SIN cadena de respaldo: si NIM devolvía
  // algo no-JSON o se colgaba (mismo mal que tumbó el triaje, PR #745), la factura quedaba
  // vacía → 'error' mudo. Ahora Groq va primero (segundos) y NIM de respaldo; el primer JSON
  // válido y no vacío gana. Si ambos fallan → {} y el llamador avisa.
  if (input.text) {
    const user = `Factura:\n${input.text.slice(0, 4000)}`
    for (const via of ['groq', 'nim'] as const) {
      try {
        const raw = via === 'groq'
          ? await extraerConGroq(user)
          : await nimChat(
              { apiKey: nimConfig().apiKey, textModel: NVIDIA_TEXT },
              [{ role: 'system', content: INVOICE_SYSTEM }, { role: 'user', content: user }],
              { maxTokens: 512, temperature: 0.1, signal: AbortSignal.timeout(20_000) },
            )
        const obj = JSON.parse(raw.replace(/```json|```/g, '').trim())
        if (obj && typeof obj === 'object' && Object.keys(obj).length > 0) return obj
      } catch (e) {
        console.warn(`[extraer] extracción ${via} falló:`, String(e).slice(0, 140))
      }
    }
    return {}
  }

  return {}
}
