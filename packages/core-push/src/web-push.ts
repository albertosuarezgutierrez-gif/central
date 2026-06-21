import webpush from 'web-push'

/** Datos VAPID con los que se firma cada envío. `subject` = `mailto:` o URL https. */
export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

/** Suscripción Web Push (forma estándar del navegador). */
export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Resultado de un envío. `gone` = la suscripción está muerta (404/410) → el
 *  llamante debería borrarla de su BD. Nunca lanza: el push es no crítico. */
export interface SendPushResult {
  ok: boolean
  statusCode?: number
  gone: boolean
  error?: unknown
}

/**
 * Envía UNA notificación Web Push. Núcleo puro e identity-agnostic: no toca BD,
 * no sabe de inquilinos ni de la forma del payload de negocio. Cada vertical pone
 * su propio scope (qué suscripciones), su payload y el borrado de las muertas.
 *
 * `payload` puede ser un string ya serializado o un objeto (se hace JSON.stringify).
 */
export async function sendWebPush(
  vapid: VapidConfig,
  subscription: PushSubscriptionInput,
  payload: string | Record<string, unknown>,
): Promise<SendPushResult> {
  try {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const res = await webpush.sendNotification(subscription, body)
    return { ok: true, statusCode: res.statusCode, gone: false }
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    const gone = statusCode === 404 || statusCode === 410
    return { ok: false, statusCode, gone, error: err }
  }
}
