/**
 * Los dos TECHOS de la pasada de avisos, puros y aparte para poder probarlos.
 *
 * Vive fuera de `avisos-vencimiento.ts` por la misma razón que
 * `texto-vencimiento.ts`: aquel importa `./asegura-db` sin extensión y
 * `node --test` no lo resuelve fuera de un bundler, así que un test que lo
 * importara reventaría con `ERR_MODULE_NOT_FOUND` sin que fallara nada del
 * código.
 *
 * 🚨 Los dos techos existían ya, pero CALLADOS, que es el fallo de esta casa:
 *
 * 1. **La criba SQL llevaba un `take: 500` mudo.** Al llegar a 500 filas, las
 *    que sobran no se leen — y el resumen decía `candidatas: N` como si eso
 *    fuera TODO lo que tocaba avisar hoy. Un tope que no se declara convierte
 *    «no lo he mirado» en «no hay», sobre un aviso que tiene detrás el
 *    preaviso del art. 22 LCS.
 * 2. **No había presupuesto de tiempo.** Cada candidata puede ser hasta tres
 *    consultas y un `sendMail`; al morir la función por tiempo, el resumen no
 *    vuelve (no hay respuesta) y lo ya enviado queda sellado sin parte. Con
 *    presupuesto la pasada VUELVE y dice cuántas se quedaron por intentar; las
 *    pendientes no se pierden porque sin `avisada_at` entran en la pasada
 *    siguiente.
 */

/** Tope de la criba SQL. No es el nº de avisos: es cuántas filas se MIRAN. */
export const LIMITE_OBLIGACIONES = 500

/**
 * Presupuesto de envío, por debajo del `maxDuration = 300` de la ruta. El hueco
 * que queda es para que la respuesta salga: una pasada que muere no informa.
 */
export const PRESUPUESTO_MS = 240_000

/** Lo que se reserva para UNA candidata (hasta 3 consultas + un `sendMail`). */
export const MARGEN_CANDIDATA_MS = 8_000

/**
 * ¿La criba tocó techo? `true` significa «puede haber más obligaciones que
 * avisar hoy y esta pasada no las ha visto», nunca «hay exactamente 500».
 */
export function cribaTruncada(filasLeidas: number, limite: number = LIMITE_OBLIGACIONES): boolean {
  return filasLeidas >= limite
}

/**
 * ¿Da tiempo a intentar una candidata más? Se exige el margen ENTERO: quedarse
 * a medio envío es peor que no empezarlo — el correo puede salir y no sellarse,
 * y entonces la pasada siguiente lo repite.
 */
export function quedaPresupuesto(
  transcurridoMs: number,
  presupuestoMs: number = PRESUPUESTO_MS,
  margenMs: number = MARGEN_CANDIDATA_MS,
): boolean {
  return transcurridoMs + margenMs <= presupuestoMs
}
