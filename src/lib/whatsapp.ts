/**
 * ia.rest — WhatsApp Business Cloud API (Meta)
 * Vars necesarias: WHATSAPP_API_TOKEN + WHATSAPP_PHONE_ID
 * Sin vars: degrada silenciosamente a solo log (no falla).
 *
 * Meta WhatsApp Business Cloud API:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages
 */

const WA_TOKEN   = process.env.WHATSAPP_API_TOKEN
const WA_PHONE   = process.env.WHATSAPP_PHONE_ID  // ID del número de negocio en Meta

/**
 * Formatea número para WhatsApp: quita espacios, guiones, añade prefijo 34 si ES
 */
export function formatWA(raw: string): string | null {
  if (!raw) return null
  const clean = raw.replace(/[\s\-\(\)\.]/g, '')
  if (clean.startsWith('+')) return clean.slice(1)
  if (clean.startsWith('6') || clean.startsWith('7') || clean.startsWith('9')) {
    return `34${clean}` // España
  }
  return clean
}

/**
 * Envía mensaje de texto por WhatsApp Business Cloud API.
 * Si no hay credenciales configuradas, loguea y devuelve ok: false sin lanzar error.
 */
export async function sendWhatsApp(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const numero = formatWA(to)
  if (!numero) return { ok: false, error: 'Número inválido' }

  if (!WA_TOKEN || !WA_PHONE) {
    console.log(`[WhatsApp NO CONFIGURADO] → ${numero}: ${message.slice(0, 80)}…`)
    return { ok: false, error: 'WHATSAPP_API_TOKEN o WHATSAPP_PHONE_ID no configurados' }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: numero,
        type: 'text',
        text: { body: message, preview_url: false },
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`[WhatsApp] Error ${res.status}:`, err.slice(0, 200))
      return { ok: false, error: `HTTP ${res.status}` }
    }

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[WhatsApp] Exception:', msg)
    return { ok: false, error: msg }
  }
}
