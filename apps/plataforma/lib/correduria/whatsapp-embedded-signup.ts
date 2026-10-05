// Embedded Signup de WhatsApp (Coexistence) en el NAVEGADOR: qué se le pide a FB.login y cómo se lee el
// `postMessage` que manda Meta al acabar. PURO (testeable). Lo usa
// app/(usuario)/correduria/ajustes/whatsapp/WhatsappConexion.tsx. Doc: apps/asegura/docs/WHATSAPP.md.
//
// ⚠️ Duda abierta sobre v4 (v2/v3 se retiran el 15/10/2026): la VERSIÓN del flujo la fija la
// configuración (`config_id`) creada en Meta → «Facebook Login for Business» → plantilla de WhatsApp
// Embedded Signup. Las `extras` de abajo son las documentadas para el onboarding de la app (Coexistence);
// si la doc vigente de v4 pide otra clave (p. ej. `version`), se cambia AQUÍ y en su test.

export const FEATURE_TYPE_COEXISTENCIA = 'whatsapp_business_app_onboarding'
/** Versión con la que se inicializa el SDK JS (FB.init). La del canje en servidor es WHATSAPP_GRAPH_API_VERSION (asegura). */
export const VERSION_SDK_META = 'v24.0'

export function opcionesLogin(configId: string) {
  return {
    config_id: configId,
    response_type: 'code',
    override_default_response_type: true,
    extras: { setup: {}, featureType: FEATURE_TYPE_COEXISTENCIA, sessionInfoVersion: '3' },
  } as const
}

export type EventoSignup =
  | { tipo: 'fin'; wabaId: string; phoneNumberId: string; businessId: string | null }
  | { tipo: 'cancelado'; paso: string | null }
  | { tipo: 'error'; mensaje: string }

const ID = /^\d{1,30}$/

/** Solo mensajes de facebook.com (https). Cualquier otro origen o forma → `null` (se ignora). */
export function origenMeta(origin: string): boolean {
  try {
    const u = new URL(origin)
    return u.protocol === 'https:' && (u.hostname === 'facebook.com' || u.hostname.endsWith('.facebook.com'))
  } catch {
    return false
  }
}

export function leerEventoSignup(origin: string, data: unknown): EventoSignup | null {
  if (!origenMeta(origin)) return null
  let d: unknown = data
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d)
    } catch {
      return null
    }
  }
  if (!d || typeof d !== 'object') return null
  const o = d as { type?: unknown; event?: unknown; data?: Record<string, unknown> }
  if (o.type !== 'WA_EMBEDDED_SIGNUP') return null
  const x = o.data && typeof o.data === 'object' ? o.data : {}
  if (o.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' || o.event === 'FINISH') {
    const waba = x.waba_id
    const tel = x.phone_number_id
    const negocio = x.business_id
    if (typeof waba !== 'string' || !ID.test(waba)) return { tipo: 'error', mensaje: 'Meta no devolvió el id de la cuenta de WhatsApp Business.' }
    // En Coexistence el phone_number_id puede faltar en el evento: sin él no se puede seguir (se dice).
    if (typeof tel !== 'string' || !ID.test(tel)) return { tipo: 'error', mensaje: 'Meta no devolvió el id del número. Repite la conexión.' }
    return { tipo: 'fin', wabaId: waba, phoneNumberId: tel, businessId: typeof negocio === 'string' && ID.test(negocio) ? negocio : null }
  }
  if (o.event === 'CANCEL') return { tipo: 'cancelado', paso: typeof x.current_step === 'string' ? x.current_step.slice(0, 80) : null }
  if (o.event === 'ERROR') return { tipo: 'error', mensaje: typeof x.error_message === 'string' ? x.error_message.slice(0, 200) : 'Error en el alta de Meta.' }
  return null
}

const MOTIVO: Record<string, string> = {
  ALTA: 'conectada desde esta pantalla',
  ACCOUNT_RECONNECTED: 'reconectada',
  ACCOUNT_OFFBOARDED: 'dada de baja de la plataforma',
  PRIMARY_INACTIVITY: 'la app del móvil lleva 14 días sin abrirse',
  COMPANION_INACTIVITY: 'un dispositivo vinculado lleva demasiado tiempo inactivo',
  BUSINESS_DOWNGRADE: 'la cuenta pasó a WhatsApp normal',
  CHANGE_NUMBER: 'se cambió el número en la app',
  USER_RE_REGISTERED: 'el número se volvió a registrar en la app',
  ACCOUNT_DISCONNECTED: 'se desconectó desde el móvil',
}

export function textoMotivoWhatsapp(motivo: string | null | undefined): string | null {
  if (!motivo) return null
  return MOTIVO[motivo] ?? motivo
}

/** Qué falta para poder pulsar el botón (variables de plataforma y de asegura). Vacío = listo. */
export function faltanParaConectar(p: { appId: string | undefined; configId: string | undefined; config: Record<string, unknown> | null }): string[] {
  const f: string[] = []
  if (!p.appId) f.push('NEXT_PUBLIC_META_APP_ID (plataforma)')
  if (!p.configId) f.push('NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID (plataforma)')
  const c = p.config
  if (!c) f.push('el estado de asegura (no se pudo leer)')
  else {
    if (c.appId !== true) f.push('WHATSAPP_APP_ID (asegura)')
    if (c.appSecret !== true) f.push('WHATSAPP_APP_SECRET (asegura)')
    if (c.versionGraph === null) f.push('WHATSAPP_GRAPH_API_VERSION bien formada (asegura)')
  }
  return f
}
