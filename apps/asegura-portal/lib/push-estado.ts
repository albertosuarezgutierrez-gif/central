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

// ─── Bienvenida de avisos (13/10/2026) ───────────────────────────────────────

/** Lo que se dijo con «Ahora no»: si se podía activar, o si era la guía de instalar en iPhone. */
export type VistaPospuesta = 'inactivas' | 'instalar_ios'

/** «Ahora no» tapa la pregunta estos días (= `DIAS_POSPONER_BIENVENIDA` del módulo; lo cruza el test). */
export const DIAS_POSPONER = 14

export interface EntradaBienvenida {
  /** Lo que decide `decidirVistaPush` en ESTE dispositivo. */
  vista: VistaPush
  /** Alberto mirando como el cliente: no se le pregunta (no puede consentir por él). */
  corredor: boolean
  /** Último «Ahora no» guardado en la BD para esta identidad; `null` = nunca. */
  pospuestaEn: Date | null
  pospuestaVista: VistaPospuesta | null
  ahora: Date
}

export type Bienvenida = 'no' | 'preguntar' | 'guiar_ios'

/**
 * ¿Se enseña la bienvenida de avisos («¿Te avisamos…?»)? Solo cuando hay algo que ofrecer en ESTE
 * dispositivo:
 *  · `activas` (ya está), `bloqueadas` (el permiso está en «denegado»: preguntar no sirve; lo explica
 *    Configuración), `sin_soporte` y `sin_configurar` → no.
 *  · `inactivas` → se pregunta; `instalar_ios` → se enseña la guía de «Añadir a pantalla de inicio».
 *  · «Ahora no» hace menos de 14 días → no, SALVO que se dijera a la guía de instalar y ahora ya se
 *    pueda activar (la abrió instalada): eso es otra pregunta.
 */
export function decidirBienvenidaAvisos(e: EntradaBienvenida): Bienvenida {
  if (e.corredor) return 'no'
  if (e.vista !== 'inactivas' && e.vista !== 'instalar_ios') return 'no'
  if (e.pospuestaEn !== null) {
    const reciente = e.ahora.getTime() - e.pospuestaEn.getTime() < DIAS_POSPONER * 86_400_000
    const yaInstalada = e.pospuestaVista === 'instalar_ios' && e.vista === 'inactivas'
    if (reciente && !yaInstalada) return 'no'
  }
  return e.vista === 'inactivas' ? 'preguntar' : 'guiar_ios'
}

// ─── Consentimiento `avisos` al activar/desactivar (13/10/2026) ──────────────

export interface EntradaRegistroAvisos {
  accion: 'activar' | 'desactivar'
  /** Última fila `avisos` sobre la versión ACTUAL del texto (`consentimientoVigente(…, version)`). */
  vigenteVersionActual: boolean | null
  /** Última fila `avisos` de cualquier versión (`consentimientoVigente(…)` sin versión). */
  ultima: boolean | null
  /** Tras desactivar: ¿le queda a la identidad algún dispositivo suscrito? */
  quedanSuscripciones: boolean
}

/**
 * Qué fila de `portal_consentimiento` (append-only) toca escribir, o `null` si ninguna.
 *  · Activar: `true` si no consta ya un «sí» sobre el texto de HOY (activar en un segundo
 *    dispositivo no duplica la fila; un «sí» sobre un texto viejo se vuelve a sellar).
 *  · Desactivar: `false` solo si NO le queda ningún dispositivo (el consentimiento es de la persona,
 *    no del móvil: mientras otro siga recibiendo, retirarlo sería una prueba falsa) y la última fila
 *    era un «sí». Sin fila previa no se escribe un «no» que nadie dio.
 */
export function decidirRegistroAvisos(e: EntradaRegistroAvisos): boolean | null {
  if (e.accion === 'activar') return e.vigenteVersionActual === true ? null : true
  if (e.quedanSuscripciones) return null
  return e.ultima === true ? false : null
}
