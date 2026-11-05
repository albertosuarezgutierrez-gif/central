// Extractor REAL de facturas de proveedor (puerto `ExtractorFactura` de lib/portal-proveedor.ts). Minimización de datos:
//   · XML (Facturae/UBL): se lee SIN IA (`leerFacturaXml`). Solo si no se entiende, va a la IA el XML MINIMIZADO (sin firma,
//     adjuntos, direcciones, contactos ni cuentas).
//   · PDF con texto: a la IA va SOLO el texto, sin IBAN, correos ni teléfonos (`minimizarTextoFactura`) y recortado.
//   · Imagen (JPG/PNG): visión; sale la imagen tal cual (no hay forma de recortarla sin leerla). Un PDF escaneado sin texto NO se
//     manda: queda «ilegible» y una persona lo valora a mano.
// A la IA nunca va nada del taller: ni su nombre, ni el pedido, ni el cliente final. Sin claves en el código: las lee core-ai del entorno
// (OPENROUTER_API_KEY / NVIDIA_API_KEY / GROQ_API_KEY…; visión: OPENROUTER_API_KEY + OPENROUTER_VISION_MODEL).
import { aiComplete, cleanJSON, openrouterVision } from '@central/core-ai'
import { leerFacturaXml, minimizarTextoFactura, PROMPT_EXTRACCION_FACTURA, xmlMinimizado } from '@central/module-portal-proveedor'
import type { ExtractorFactura, ExtraccionFactura } from './portal-proveedor.ts'

const MAX_TOKENS = 2000

function parsear(t: string): unknown {
  try { return JSON.parse(cleanJSON(t)) } catch { return null }
}

async function porTexto(texto: string): Promise<ExtraccionFactura> {
  const r = await aiComplete(`Factura:\n${texto}`, { system: PROMPT_EXTRACCION_FACTURA, maxTokens: MAX_TOKENS, temperature: 0, timeoutMs: 60_000 })
  const raw = parsear(r)
  return raw ? { ok: true, raw, origen: 'ia' } : { ok: false, motivo: 'la IA no devolvió un JSON válido' }
}

async function textoDePdf(bytes: Uint8Array): Promise<string> {
  // Import perezoso del implementador interno (mismo patrón que los lectores de PDF de plataforma).
  const mod = await import('pdf-parse/lib/pdf-parse.js')
  const r = await mod.default(Buffer.from(bytes))
  return String(r?.text ?? '')
}

export const extractorFacturaIa: ExtractorFactura = {
  async extraer({ mime, bytes }) {
    if (mime === 'application/xml') {
      const xml = new TextDecoder('utf-8').decode(bytes)
      const raw = leerFacturaXml(xml)
      if (raw) return { ok: true, raw, origen: 'xml' }
      const min = xmlMinimizado(xml)
      return min ? porTexto(min) : { ok: false, motivo: 'XML no legible' }
    }
    if (mime === 'application/pdf') {
      const t = (await textoDePdf(bytes)).trim()
      if (!t) return { ok: false, motivo: 'PDF sin capa de texto (escaneado): valóralo a mano' }
      return porTexto(minimizarTextoFactura(t))
    }
    if (mime === 'image/jpeg' || mime === 'image/png') {
      const apiKey = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_VISION_MODEL
      if (!apiKey || !model) return { ok: false, motivo: 'lectura de imágenes no configurada' }
      const t = await openrouterVision({ apiKey }, PROMPT_EXTRACCION_FACTURA, [{ data: Buffer.from(bytes).toString('base64'), mediaType: mime }],
        'Extrae los datos de esta factura en JSON:', { model, maxTokens: MAX_TOKENS, privacidad: true, signal: AbortSignal.timeout(60_000) })
      const raw = parsear(t)
      return raw ? { ok: true, raw, origen: 'ia' } : { ok: false, motivo: 'la IA no devolvió un JSON válido' }
    }
    return { ok: false, motivo: 'tipo no admitido' }
  },
}
