// @iarest/core-push — núcleo de notificaciones web-push (casa de marcas).
// Adaptador puro sobre `web-push`; la config VAPID y las suscripciones (BD) las
// gestiona cada app. Ver docs/ARQUITECTURA-casa-marcas.md (Capa 1).

export { sendWebPush } from './web-push'
export type { VapidConfig, WebPushSubscription, WebPushResult } from './web-push'
