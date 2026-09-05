/**
 * Los RECIBOS que ve el cliente.
 *
 * Alberto, mirando el lateral del portal: «y los recibos? e historial
 * siniestros?». El historial de siniestros se hizo el 05/09/2026; esto es la
 * otra mitad.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LO QUE SE MIDIÓ ANTES DE ESCRIBIR ESTO, porque cambió el diseño. Los 183
 * recibos de la cartera viva, el 05/09/2026:
 *
 * 1. **`anulado` NO es «un recibo que no se pagó»: es el cubo donde la
 *    compañía mete los movimientos que se cancelan entre sí.** Son 54 de los
 *    183, y de esos **25 tienen importe NEGATIVO** (extornos), 8 valen 0 € y 21
 *    son positivos; el mínimo es −1.268,18 € y el máximo +1.268,18 € — el mismo
 *    número con los dos signos, que es un extorno y su re-emisión. Enseñarle a
 *    un cliente un «recibo de −1.268,18 €» no es informarle: es hacerle llamar.
 *    **No entran en la lista, y ningún cubo los cuenta.**
 *
 * 2. **Y por eso mismo hay un TERCER estado que antes no existía.** De las 110
 *    pólizas vivas, **20 tienen recibos y TODOS son anulados**. Con el resumen
 *    que había, esas 20 no pintaban NADA: `total` contaba los anulados, así
 *    que no salía el hueco de «sin informar», y como no quedaba ni uno al cobro
 *    ni ninguno cobrado, la función devolvía `null`. Veinte pólizas de ciento
 *    diez, mudas. Pero decirles «tu compañía no nos ha informado de ningún
 *    recibo» sería la otra mentira: sí informó, y todos están anulados. Son
 *    tres cosas distintas y se dicen con tres frases distintas
 *    (`estadoRecibos()`).
 *
 * 3. **`forma_pago` es un CÓDIGO, no una palabra**: en la cartera viva vale
 *    `CC` (117), `OF` (6) y `TA` (4), y 56 recibos no lo traen. `CC` se
 *    adivina, `OF` no. Es el mismo caso que `siniestros.tipo`, así que sigue la
 *    misma regla: **no se pide a la BD y no se pinta** hasta que exista una
 *    tabla que traduzca esos códigos.
 *
 * 4. **Hay una fecha CENTINELA**: un recibo `pendiente` trae `fecha_emision`
 *    `0001-01-01`. Es un «no lo sé» disfrazado de dato — se cuela por toda
 *    guarda basada en `NULL` y en pantalla saldría «01/01/0001». Se anula al
 *    leerla (`fechaReciboFiable`), que es lo que manda el `CLAUDE.md` de la
 *    raíz sobre los valores de cajón.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Los cinco valores que existen en `seguros.recibo_estado`. */
export const SITUACIONES_RECIBO = ['emitido', 'pendiente', 'cobrado', 'devuelto', 'anulado'] as const
export type SituacionRecibo = (typeof SITUACIONES_RECIBO)[number]

export type ReciboHistorial = {
  situacion: string
  /** `null` = el texto del EIAC no tenía forma de importe. **No es 0 €.** */
  importe: number | null
  fechaEmision: Date | null
  fechaVencimiento: Date | null
}

function normalizar(situacion: string): string {
  return situacion.trim().toLowerCase()
}

/**
 * ¿Está anulado? **La fuente única**, y la guarda más importante de este
 * fichero: un anulado no entra en la lista del cliente ni suma en ningún cubo
 * (ver el punto 1 de la cabecera).
 */
export function reciboAnulado(situacion: string): boolean {
  return normalizar(situacion) === 'anulado'
}

/**
 * ¿Está al cobro? `emitido` y `pendiente` son la misma situación para el
 * cliente: hay dinero por pagar. Hoy la cartera viva solo tiene `pendiente`,
 * pero `emitido` está en el vocabulario de la BD y colapsarlo sería perderlo.
 */
export function reciboAlCobro(situacion: string): boolean {
  const s = normalizar(situacion)
  return s === 'emitido' || s === 'pendiente'
}

/**
 * Cómo se le dice la situación al cliente.
 *
 * Un valor fuera del vocabulario se devuelve **tal cual** en vez de caer a
 * «cobrado»: mejor una palabra rara que alguien pregunta que una palabra
 * tranquilizadora que no es verdad.
 */
export function etiquetaSituacionRecibo(situacion: string): string {
  switch (normalizar(situacion)) {
    case 'cobrado':
      return 'Cobrado'
    case 'pendiente':
      return 'Pendiente de cobro'
    case 'emitido':
      return 'Emitido, pendiente de cobro'
    case 'devuelto':
      return 'Devuelto'
    case 'anulado':
      return 'Anulado'
    default:
      return situacion
  }
}

/**
 * El tono con el que se pinta. `devuelto` NO es neutro: el cobro se intentó y
 * falló, y es lo único de esta pantalla sobre lo que el cliente tiene que
 * hacer algo.
 */
export function tonoSituacionRecibo(situacion: string): 'cobrado' | 'al-cobro' | 'devuelto' | 'anulado' {
  const s = normalizar(situacion)
  if (s === 'devuelto') return 'devuelto'
  if (reciboAnulado(s)) return 'anulado'
  if (reciboAlCobro(s)) return 'al-cobro'
  return 'cobrado'
}

/**
 * Una fecha de la BD, o `null` si es un centinela.
 *
 * 🚨 Punto 4 de la cabecera: hay un recibo con `fecha_emision` `0001-01-01`.
 * `NULL` al menos se ve; un año 1 es un «no lo sé» con forma de dato que pasa
 * por `??`, por `IS NULL` y por cualquier `COALESCE`, y acaba en pantalla como
 * «01/01/0001». El corte está en 1900, holgado a propósito: el recibo más
 * antiguo de esta BD se emitió en 2024, así que no hay ninguna fecha real en
 * juego, y lo que se busca es cazar el año 1 sin ponerse a discutir cuál es la
 * primera fecha creíble. **Un epoch `1970-01-01` NO lo caza** —ni se ha medido
 * ninguno—: si algún día aparece, esto se cambia con el dato delante.
 */
export function fechaReciboFiable(fecha: Date | null | undefined): Date | null {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return null
  return fecha.getUTCFullYear() < 1900 ? null : fecha
}

/**
 * Los recibos que el cliente ve, del más reciente al más antiguo.
 *
 * Quita los anulados (punto 1) y ordena por emisión.
 *
 * 🚨 Los que **no tienen fecha van al FINAL**, no al principio: en Postgres
 * `DESC` implica `NULLS FIRST`, así que lo que no se sabe se cuela arriba y
 * entierra lo que sí. Una fecha ausente no es ni reciente ni antigua. Es la
 * misma trampa que ya mordió en la ficha del corredor (#2346) y en el historial
 * de siniestros.
 */
export function ordenarRecibos<T extends { situacion: string; fechaEmision: Date | null }>(
  recibos: readonly T[],
): T[] {
  return recibos
    .filter((r) => !reciboAnulado(r.situacion))
    .sort((a, b) => {
      if (a.fechaEmision === null && b.fechaEmision === null) return 0
      if (a.fechaEmision === null) return 1
      if (b.fechaEmision === null) return -1
      return b.fechaEmision.getTime() - a.fechaEmision.getTime()
    })
}

/**
 * En qué estado está el bloque de recibos de una póliza. **Tres cosas
 * distintas, tres frases distintas** — ver el punto 2 de la cabecera:
 *
 * - `sin_informar`: la compañía no ha mandado ni un recibo. NO es «estás al
 *   corriente»: nadie lo ha comprobado.
 * - `solo_anulados`: mandó recibos y **todos** están anulados. Son 20 pólizas
 *   de 110, y antes de esto no pintaban nada en absoluto.
 * - `con_recibos`: hay al menos uno que el cliente puede leer.
 */
export function estadoRecibos(
  recibos: readonly { situacion: string }[],
): 'sin_informar' | 'solo_anulados' | 'con_recibos' {
  if (recibos.length === 0) return 'sin_informar'
  return recibos.some((r) => !reciboAnulado(r.situacion)) ? 'con_recibos' : 'solo_anulados'
}

export type ResumenRecibos = {
  /**
   * Cuántos ve el cliente. **NO cuenta los anulados**, y ese es justo el
   * cambio: cuando los contaba, una póliza con 3 anulados y nada más decía
   * «total 3» y luego no era capaz de enseñar ninguno.
   */
  total: number
  /** Cuántos se descartaron por anulados. Para poder DECIRLO, no para sumarlo. */
  anulados: number
  /** El siguiente al cobro: el de vencimiento más próximo. */
  proximoAlCobro: ReciboHistorial | null
  /** Devueltos: el cobro se intentó y falló. */
  devueltos: number
  ultimoCobrado: ReciboHistorial | null
}

/** Recibe la lista **ya ordenada** por `ordenarRecibos` (o sea, sin anulados). */
export function resumirRecibos(
  ordenados: readonly ReciboHistorial[],
  anulados: number,
): ResumenRecibos {
  const alCobro = ordenados
    .filter((r) => reciboAlCobro(r.situacion))
    .sort(
      (a, b) =>
        (a.fechaVencimiento?.getTime() ?? Number.POSITIVE_INFINITY) -
        (b.fechaVencimiento?.getTime() ?? Number.POSITIVE_INFINITY),
    )
  return {
    total: ordenados.length,
    anulados,
    proximoAlCobro: alCobro[0] ?? null,
    devueltos: ordenados.filter((r) => tonoSituacionRecibo(r.situacion) === 'devuelto').length,
    ultimoCobrado: ordenados.find((r) => normalizar(r.situacion) === 'cobrado') ?? null,
  }
}
