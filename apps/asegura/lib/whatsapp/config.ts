// Interruptores del canal WhatsApp. PURO (testeable con un `env` inventado). Los SECRETOS se leen en
// `secretos.ts` con `requireSecret` (sin fallback a literal, nunca).
//
//   WHATSAPP_APP_SECRET        HMAC de X-Hub-Signature-256 (App Secret de la app de Meta).
//   WHATSAPP_VERIFY_TOKEN      el token que se teclea en Meta al dar de alta el webhook.
//   WHATSAPP_PHONE_NUMBER_ID   (opcional) solo se procesa lo que llega a ESTE número; sin ella, el de BD (corredurias.wa_phone_number_id).
//   ASEGURA_WHATSAPP_ACTIVO    '1' = se guarda y procesa. Otra cosa = 200 sin guardar nada.
//   ASEGURA_WHATSAPP_IA_ACTIVO '1' = el cron analiza con IA. Otra cosa = no se llama a la IA.
//   WHATSAPP_RETENCION_DIAS    días que se conserva el texto de los mensajes (por defecto 730).
//   WHATSAPP_APP_ID            id de la app de Meta (canje del `code` del Embedded Signup; con requireSecret).
//   WHATSAPP_GRAPH_API_VERSION versión de la Graph API para el alta (`vNN.N`; ver graph.ts).
//   WHATSAPP_IMPORTAR_HISTORIAL '1' = el historial que comparta la app del móvil se GUARDA en crudo (sin
//                              importar: no hay importador). Otra cosa = se descarta y solo se cuenta.
//
// No hay token de ENVÍO: este canal no manda nada a Meta.

type Env = Record<string, string | undefined>

export const RETENCION_DIAS_DEFECTO = 730
/** El crudo de Meta (que lleva número y texto en claro) se minimiza antes: lo que no se procesó en este plazo, también. */
export const RETENCION_CRUDO_DIAS = 30

export function whatsappActivo(env: Env = process.env): boolean {
  return env.ASEGURA_WHATSAPP_ACTIVO === '1'
}

/** Historial de Coexistence: sin '1' se descarta sin guardar texto (decisión de Alberto: «No compartir chats»). */
export function importarHistorial(env: Env = process.env): boolean {
  return env.WHATSAPP_IMPORTAR_HISTORIAL === '1'
}

export function iaWhatsappActiva(env: Env = process.env): boolean {
  return env.ASEGURA_WHATSAPP_IA_ACTIVO === '1'
}

/**
 * Días de retención. Ausente → 730. Un valor que no es un entero ≥ 30 NO se interpreta como «0 =
 * borrar todo» ni como «sin límite»: se devuelve `null` y el cron de retención no purga y lo dice.
 */
export function diasRetencion(env: Env = process.env): number | null {
  const v = env.WHATSAPP_RETENCION_DIAS
  if (v === undefined || v.trim() === '') return RETENCION_DIAS_DEFECTO
  if (!/^\d{1,5}$/.test(v.trim())) return null
  const n = Number(v.trim())
  return n >= 30 ? n : null
}
