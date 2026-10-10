/**
 * Qué enseña el interruptor de avisos por notificación (`app/ActivarPush.tsx`), decidido AQUÍ y puro
 * para poder cepar cada rama. El componente solo lee el navegador y pinta lo que esto devuelve.
 *
 * Tres estados con sentido para la persona, más lo que no se puede ofrecer:
 *  · `activas`: permiso concedido Y suscripción local. Es el ÚNICO caso en que se dicen activadas.
 *  · `inactivas`: se pueden activar (permiso por pedir, o concedido pero sin suscripción).
 *  · `bloqueadas`: el navegador tiene el permiso en «denegado»: pulsar no hace nada, solo se EXPLICA
 *    cómo desbloquearlo en los ajustes del sitio (sin botón de reintento inútil).
 *  · `instalar_ios`: iPhone/iPad sin instalar la app en la pantalla de inicio; Safari solo ofrece push
 *    a las web apps instaladas, así que el camino es instalar.
 *  · `sin_soporte`: este navegador no admite avisos.
 *  · `sin_configurar`: falta la clave pública VAPID en el despliegue; no se ofrece lo que no puede
 *    funcionar y tampoco se culpa al navegador de un fallo nuestro.
 *
 * 🚨 Una suscripción local con el permiso en `denied` o `default` NO cuenta como activa: el navegador
 * no entregaría nada, y decir «activadas» sería mentir.
 */
export type VistaPush = 'activas' | 'inactivas' | 'bloqueadas' | 'instalar_ios' | 'sin_soporte' | 'sin_configurar'

export type PermisoNotificaciones = 'default' | 'granted' | 'denied'

export interface EntradaVistaPush {
  /** `serviceWorker` en navigator. */
  serviceWorker: boolean
  /** `PushManager` en window. */
  pushManager: boolean
  /** `Notification` en window. */
  notificaciones: boolean
  /** Hay `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en el despliegue. */
  clavePublica: boolean
  /** iPhone/iPad SIN instalar como app (el estado `ios` de `useInstalacion`). */
  iosSinInstalar: boolean
  /** `Notification.permission`; `null` si no se pudo leer. */
  permiso: PermisoNotificaciones | null
  /** Hay una suscripción push local en este dispositivo. */
  suscripcionLocal: boolean
}

export function decidirVistaPush(e: EntradaVistaPush): VistaPush {
  if (!e.clavePublica) return 'sin_configurar'
  if (!e.serviceWorker || !e.pushManager || !e.notificaciones) {
    return e.iosSinInstalar ? 'instalar_ios' : 'sin_soporte'
  }
  if (e.permiso === 'denied') return 'bloqueadas'
  if (e.permiso === 'granted' && e.suscripcionLocal) return 'activas'
  return 'inactivas'
}
