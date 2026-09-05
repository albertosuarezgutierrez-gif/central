// Analítica de la web pública: PostHog SOLO con consentimiento, gestionado por Cookiebot.
//
// 🚨 Esto existe por un fallo MEDIDO en la otra web de la correduría (el CRM de
// Manuel, 04/09/2026): allí `posthog-browser.ts` hace *fail-open* — si falta
// `NEXT_PUBLIC_COOKIEBOT_ID` no pinta banner y **arranca PostHog igual**. O sea,
// una variable de entorno que nadie puso convirtió una web con DPO publicado en
// una web que instala cookies de análisis sin pedir permiso (art. 22.2 LSSI).
// El fallo no se ve: la página funciona, la analítica llega, y lo único que
// falta es el banner que nadie echa de menos.
//
// Aquí la decisión es la contraria y es el motivo de que este módulo sea puro y
// testeado: **sin gestor de consentimiento no hay medición**. Es la misma regla
// del repo que dice que un dato que no se ha mirado no se afirma — un
// consentimiento que no se ha pedido no se supone.

/** Identificador del dominio en Cookiebot (`data-cbid`). Sin él NO se mide. */
export const COOKIEBOT_ID = process.env.NEXT_PUBLIC_COOKIEBOT_ID || ''

/** Clave de proyecto de PostHog (pública por diseño: viaja al navegador). */
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || ''

/**
 * Host de ingesta de PostHog, sin barra final.
 *
 * El defecto es la nube EUROPEA a propósito: es donde está el proyecto de la
 * correduría, y un defecto que apuntara a la nube de EE. UU. sacaría datos de
 * visitantes españoles del EEE sin que nada fallara.
 */
export const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com').replace(/\/+$/, '')

/** URL del script de PostHog. No se descarga hasta que hay consentimiento. */
export function scriptPostHog(host: string = POSTHOG_HOST): string {
  return `${host.replace(/\/+$/, '')}/static/array.js`
}

/** Lo que Cookiebot dice que el visitante ha aceptado. */
export type Consentimiento = {
  /** Cookies de medición/estadística. Es la categoría que gobierna PostHog. */
  statistics?: boolean
  marketing?: boolean
  preferences?: boolean
}

export type ConfigAnalitica = {
  cookiebotId: string
  posthogKey: string
}

/**
 * ¿Se puede medir AHORA MISMO? Única fuente de la decisión.
 *
 * Devuelve `true` solo si se cumplen las tres cosas a la vez, y **el orden
 * importa menos que el hecho de que ninguna se pueda omitir**:
 *
 * 1. Hay gestor de consentimiento configurado (`cookiebotId`). Sin él no hay
 *    banner, luego no hay forma de pedir permiso, luego no se mide. Este es el
 *    brazo que le faltaba a la app de Manuel.
 * 2. Hay clave de PostHog. Sin ella no hay nada que arrancar.
 * 3. El visitante ha aceptado la categoría `statistics`. `undefined` es «aún no
 *    ha contestado», y eso NO es un sí: es exactamente el `NULL` que el repo
 *    prohíbe colapsar a un valor cómodo.
 */
export function puedeMedir(consentimiento: Consentimiento | null | undefined, config: ConfigAnalitica): boolean {
  if (!config.cookiebotId) return false
  if (!config.posthogKey) return false
  return consentimiento?.statistics === true
}
