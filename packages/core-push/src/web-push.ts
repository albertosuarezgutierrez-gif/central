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

/** Urgencia RFC 8030 admitida por `web-push`. */
export type PushUrgency = 'very-low' | 'low' | 'normal' | 'high'

/**
 * Opciones de entrega, TODAS opcionales. Sin ellas el envío es idéntico al de siempre
 * (TTL por defecto de `web-push` = 4 semanas, urgencia `normal`, sin `Topic`).
 *  · `ttl`: segundos que el servicio de push retiene el mensaje si el dispositivo está apagado.
 *  · `urgency`: cabecera `Urgency`.
 *  · `topic`: cabecera `Topic` (≤32 caracteres base64url): un mensaje nuevo con el mismo topic
 *    SUSTITUYE al pendiente, así un reintento no duplica el aviso.
 */
export interface SendPushOptions {
  ttl?: number
  urgency?: PushUrgency
  topic?: string
}

/**
 * Traduce `SendPushOptions` a las opciones de `web-push`, incluyendo SOLO lo informado: lo que
 * no se pasa conserva el valor por defecto de la librería. `undefined` si no hay nada que pasar.
 */
export function opcionesDeEnvio(opts?: SendPushOptions): { TTL?: number; urgency?: PushUrgency; topic?: string } | undefined {
  if (!opts) return undefined
  const salida: { TTL?: number; urgency?: PushUrgency; topic?: string } = {}
  if (opts.ttl !== undefined) salida.TTL = opts.ttl
  if (opts.urgency !== undefined) salida.urgency = opts.urgency
  if (opts.topic !== undefined) salida.topic = opts.topic
  return Object.keys(salida).length > 0 ? salida : undefined
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
  options?: SendPushOptions,
): Promise<SendPushResult> {
  try {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const res = await webpush.sendNotification(subscription, body, opcionesDeEnvio(options))
    return { ok: true, statusCode: res.statusCode, gone: false }
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    const gone = statusCode === 404 || statusCode === 410
    return { ok: false, statusCode, gone, error: err }
  }
}
