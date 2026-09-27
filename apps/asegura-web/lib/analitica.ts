// Analítica de la web pública: PostHog SOLO con consentimiento, gestionado por
// nuestro propio banner (@central/core-consent, vanilla-cookieconsent) — ya NO
// por Cookiebot.
//
// 🚨 Esto existe por un fallo MEDIDO en la otra web de la correduría (el CRM de
// Manuel, 04/09/2026): allí `posthog-browser.ts` hace *fail-open* — si falta
// `NEXT_PUBLIC_COOKIEBOT_ID` no pinta banner y **arranca PostHog igual**. O sea,
// una variable de entorno que nadie puso convirtió una web con DPO publicado en
// una web que instala cookies de análisis sin pedir permiso (art. 22.2 LSSI).
// El fallo no se ve: la página funciona, la analítica llega, y lo único que
// falta es el banner que nadie echa de menos.
//
// Aquí la decisión es la contraria, y ahora ya no depende de una credencial de
// un proveedor externo de CMP: el banner es NUESTRO (vanilla-cookieconsent), así
// que la única forma de no tenerlo sería no montar <Analitica /> — y eso lo
// vigila el guardián de fuente, no una env. La regla de fondo no cambia: **sin
// consentimiento explícito no hay medición**, y `puedeCargar()` (del paquete
// compartido) es la única fuente de esa decisión, igual que antes lo era
// `puedeMedir()` aquí.
export { puedeCargar, configBanner, arrancarPostHog, apagarPostHog, cargarGa4 } from '@central/core-consent'

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
