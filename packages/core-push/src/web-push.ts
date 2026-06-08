// Núcleo de notificaciones web-push (casa de marcas).
// Adaptador PURO sobre la librería `web-push`: la config (VAPID) y el origen de
// las suscripciones (BD, scope por inquilino) los inyecta/gestiona la app. Este
// núcleo solo envía un payload a UNA suscripción y reporta el resultado.

/** Credenciales VAPID (las inyecta la app desde su entorno). */
export interface VapidConfig {
  subject: string      // p.ej. 'mailto:hola@ejemplo.com'
  publicKey: string
  privateKey: string
}

/** Suscripción push estándar del navegador. */
export interface WebPushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface WebPushResult {
  ok: boolean
  statusCode?: number
  /** true si el endpoint ya no existe (410 Gone) → la app debe borrar la suscripción. */
  gone: boolean
}

/**
 * Envía un payload a una suscripción web-push. **No lanza**: devuelve el resultado
 * (incluido `gone` para 410). El envío push es best-effort en las apps consumidoras.
 */
export async function sendWebPush(
  vapid: VapidConfig,
  subscription: WebPushSubscription,
  payload: unknown,
): Promise<WebPushResult> {
  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys } as any,
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    )
    return { ok: true, gone: false }
  } catch (e: any) {
    const statusCode = e?.statusCode
    return { ok: false, statusCode, gone: statusCode === 410 }
  }
}
