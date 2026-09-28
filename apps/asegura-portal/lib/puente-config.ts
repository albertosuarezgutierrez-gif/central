/** Cuánto se espera al puerto de asegura antes de decir que no respondió.
 *  Vive aparte para que lo puedan leer el módulo y su test sin arrastrar el
 *  `fetch`. 8 s: por encima de eso el navegador del cliente ya parece colgado. */
export const PORTAL_PUENTE_TIEMPO_MS = 8_000

/** Las acciones de IA del presupuesto (resumen y preguntas) esperan más: la IA tarda. Por encima de
 *  esto se dice «no está disponible ahora» y la tabla de coberturas sigue ahí. */
export const PORTAL_PUENTE_IA_MS = 25_000
