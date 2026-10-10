// A QUÉ número/WABA pertenece lo que llega al webhook. PURO (testeable). Doc: docs/WHATSAPP.md.
//
//   · phone_number_id válido: la env WHATSAPP_PHONE_NUMBER_ID si está puesta; si no, el guardado en BD
//     tras el alta (corredurias.wa_phone_number_id).
//   · WABA válida: la guardada en BD (corredurias.wa_business_account_id); sirve para los eventos de
//     cuenta cuando no hay phone id.
//   · Ninguno de los dos → el webhook contesta 200 sin procesar (nunca 503: Meta reintentaría).

export type DestinoWebhook = { phoneNumberId: string | null; wabaId: string | null }

const limpio = (v: string | null | undefined): string | null => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t === '' ? null : t
}

export function resolverDestino(envPhoneNumberId: string | null | undefined, bd: { phoneNumberId: string | null; wabaId: string | null } | null): DestinoWebhook {
  return {
    phoneNumberId: limpio(envPhoneNumberId) ?? limpio(bd?.phoneNumberId),
    wabaId: limpio(bd?.wabaId),
  }
}

export const hayDestino = (d: DestinoWebhook): boolean => d.phoneNumberId !== null || d.wabaId !== null
