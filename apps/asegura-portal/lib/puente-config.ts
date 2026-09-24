/** Cuánto se espera al puerto de asegura antes de decir que no respondió.
 *  Vive aparte para que lo puedan leer el módulo y su test sin arrastrar el
 *  `fetch`. 8 s: por encima de eso el navegador del cliente ya parece colgado. */
export const PORTAL_PUENTE_TIEMPO_MS = 8_000
