/**
 * Los techos de las tres lecturas de cartera que sirve el puerto del operador
 * (`/api/operador/vencimientos`, `/impagados`, `/comisiones`).
 *
 * 🚨 Las tres NO tenían ninguno. Hoy no duele —la cartera viva son ~110
 * pólizas— pero un `findMany` sin `take` sobre una tabla que crece con cada
 * pasada de CIMA es una bomba de relojería con dos detonadores:
 *   1. el `maxDuration` de la función de asegura y el `AbortSignal.timeout` de
 *      15 s con que plataforma la llama: al pasarse, la pantalla no dice «hay
 *      demasiado», dice «no se pudo leer»;
 *   2. la memoria del proceso, que es donde acaba la lista entera.
 *
 * Y la razón de fondo, que es la de la casa: **cuando un techo existe tiene que
 * DECLARARSE**. Un recorte mudo presenta el recorte como el total, que es
 * exactamente el fallo de `LIMITE_OBLIGACIONES` en el cron de avisos.
 *
 * Por eso el mecanismo NO se reinventa aquí: se reusa `cribaTruncada()` de
 * `avisos-presupuesto.ts`, que ya es la única forma de esta casa de preguntar
 * «¿la criba tocó techo?». Lo único propio de este fichero son los NÚMEROS, y
 * cada uno lleva delante lo que se midió contra la BD real el 20/09/2026.
 *
 * Vive aparte de `cartera.ts` / `cartera-impagados.ts` / `comisiones.ts` por lo
 * mismo que `avisos-presupuesto.ts` vive aparte de `avisos-vencimiento.ts`:
 * aquellos importan `./asegura-db` sin extensión y `node --test` no lo resuelve
 * fuera de un bundler, así que un cepo que los importara reventaría con
 * `ERR_MODULE_NOT_FOUND` sin que fallara nada del código.
 */
export { cribaTruncada } from './avisos-presupuesto.ts'

/**
 * Pólizas que devuelve `vencimientosProximos()`.
 *
 * Medido el 20/09/2026 contra el schema `seguros`: **29 filas** en la ventana
 * por defecto (365 días atrás + 90 adelante) y **85** en la más ancha que
 * admite la ruta (`?dias=365`, o sea 365+365). El tope deja un factor ~12 sobre
 * ese máximo: la cartera puede multiplicarse por diez y seguir entrando entera.
 */
export const LIMITE_VENCIMIENTOS = 1_000

/**
 * Recibos que lee la criba de `colaRetencion()` (`devuelto` + `pendiente`).
 *
 * Medido el 20/09/2026: **28 accionables**, y **372 recibos en TODA la cartera**
 * sea cual sea su situación. O sea que hoy este tope no se puede tocar ni
 * leyendo la tabla de recibos entera, y aun así deja un factor ~5 sobre ella.
 */
export const LIMITE_RECIBOS_IMPAGO = 2_000

/**
 * Recibos cobrados que lee `comisionesCartera()` desde su fecha `desde`.
 *
 * Medido el 20/09/2026: **52** desde el 01/01/2026 (la ventana por defecto) y
 * **372** en total desde que arrancó la ingesta de CIMA (jun/2026), o sea unos
 * 106 recibos al mes. Al ritmo de hoy el tope son ≈4 años de histórico, y esta
 * lectura es la que alimenta el LIBRO DE COMISIONES: si algún día se recorta,
 * el devengo saldría más BAJO que el real y esa es justo la cifra contra la que
 * se decide si se reclama a una compañía. Por eso se declara.
 */
export const LIMITE_RECIBOS_COBRADOS = 5_000

/**
 * Filas de `cuenta_efectivo` y de `liquidaciones` que lee `comisionesCartera()`.
 *
 * Medido el 20/09/2026: **9 cuentas de efectivo y 12 liquidaciones en toda la
 * base** (no en la ventana: en total). Son una por compañía y periodo, así que
 * con las 5 compañías de la correduría son ≈60 al año: el tope son ≈8 años.
 */
export const LIMITE_LIQUIDACIONES = 500
