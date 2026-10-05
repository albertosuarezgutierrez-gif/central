// Secretos del canal WhatsApp: `requireSecret` de @central/core-identity, sin fallback a literal.
// Falta uno → `null` y quien llama responde 503 (nunca un valor de relleno).

import { requireSecret } from '@central/core-identity'

/** Un secreto, o `null` si falta (quien llama responde 503). Nunca un literal de relleno. */
export function secretoWhatsapp(nombre: 'WHATSAPP_APP_SECRET' | 'WHATSAPP_VERIFY_TOKEN' | 'WHATSAPP_PHONE_NUMBER_ID'): string | null {
  try {
    return requireSecret(nombre)
  } catch {
    return null
  }
}
