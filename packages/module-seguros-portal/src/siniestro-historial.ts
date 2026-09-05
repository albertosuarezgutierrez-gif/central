/**
 * El HISTORIAL de siniestros que ve el cliente.
 *
 * Alberto, mirando el lateral del portal: «y los recibos? e historial
 * siniestros?». No existía: `lib/cartera-lectura.ts` filtraba
 * `estado IN ('abierto','en_tramitacion')`, así que de los 67 siniestros de la
 * cartera viva el portal enseñaba 7 y **los 60 cerrados no los veía nadie**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LO QUE SE MIDIÓ ANTES DE ESCRIBIR ESTO, porque cambió el diseño:
 *
 * 1. **`siniestros.tipo` NO se pinta.** Parecía el campo más útil de la tabla
 *    —«qué le pasó»— y resultó ser un **código numérico** de la compañía:
 *    en la cartera viva sale `1107`, `1915`, `1312`, `17`, `2102`… A un cliente
 *    «Tipo 1107» no le dice nada, y peor: parece un dato que significa algo.
 *    Hasta que exista una tabla que traduzca esos códigos, **no se enseña**.
 *    (Sí se enseña `referencia`, que es el número con el que la compañía
 *    contesta al teléfono: informada en 67 de 67.)
 *
 * 2. **NO existe ninguna columna con la fecha de CIERRE.** `updated_at` es la
 *    última vez que se tocó la fila, no el día que se cerró el siniestro:
 *    pintarlo como «cerrado el X» sería inventarse una fecha con aspecto de
 *    dato — el fallo que este repo persigue. Se dice el estado, y la fecha que
 *    sí se conoce es la del HECHO.
 *
 * 3. **El estado tiene CUATRO valores, no dos**: `abierto`, `en_tramitacion`,
 *    `cerrado` y `rechazado`. Hoy la cartera viva solo tiene abiertos y
 *    cerrados, pero `rechazado` está en el vocabulario y **no es lo mismo que
 *    cerrado**: uno se resolvió y el otro la compañía no lo asumió. Colapsarlos
 *    le diría a alguien que su siniestro «se cerró» cuando le dijeron que no.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Los cuatro estados que existen en `seguros.siniestro_estado`. */
export const ESTADOS_SINIESTRO = ['abierto', 'en_tramitacion', 'cerrado', 'rechazado'] as const
export type EstadoSiniestro = (typeof ESTADOS_SINIESTRO)[number]

export type SiniestroHistorial = {
  id: string
  estado: string
  referencia: string | null
  /** La fecha del HECHO. `null` = la compañía no la informó. */
  fechaHora: Date | null
}

/**
 * ¿Sigue vivo? **La fuente única.**
 *
 * Estaba escrito a mano como un array en la consulta y otra vez en la pantalla.
 * Dos listas del mismo vocabulario acaban divergiendo el día que la compañía
 * añada un estado, y el síntoma sería que un siniestro deja de contar como
 * abierto sin que nada falle.
 */
export function siniestroAbierto(estado: string): boolean {
  const e = estado.trim().toLowerCase()
  return e === 'abierto' || e === 'en_tramitacion'
}

/**
 * Cómo se le dice el estado al cliente. Cuatro palabras distintas para cuatro
 * cosas distintas — ver el punto 3 de la cabecera.
 *
 * Un valor fuera del vocabulario se devuelve tal cual en vez de caer a
 * «cerrado»: si la compañía manda mañana un estado nuevo, es mejor que en
 * pantalla salga una palabra rara —que alguien preguntará— a que salga una
 * palabra tranquilizadora que no es verdad.
 */
export function etiquetaEstadoSiniestro(estado: string): string {
  switch (estado.trim().toLowerCase()) {
    case 'abierto':
      return 'Abierto'
    case 'en_tramitacion':
      return 'En tramitación'
    case 'cerrado':
      return 'Cerrado'
    case 'rechazado':
      return 'Rechazado por la compañía'
    default:
      return estado
  }
}

/** El tono con el que se pinta cada estado. `rechazado` NO es neutro. */
export function tonoEstadoSiniestro(estado: string): 'abierto' | 'rechazado' | 'cerrado' {
  const e = estado.trim().toLowerCase()
  if (siniestroAbierto(e)) return 'abierto'
  return e === 'rechazado' ? 'rechazado' : 'cerrado'
}

/**
 * El historial, del más reciente al más antiguo.
 *
 * 🚨 Los que **no tienen fecha van al FINAL**, no al principio. Es la misma
 * trampa que el `ORDER BY fecha DESC` de la ficha del corredor: en Postgres
 * `DESC` implica `NULLS FIRST`, así que lo que no se sabe se cuela arriba y
 * entierra lo que sí. Una fecha ausente no es ni reciente ni antigua.
 */
export function ordenarHistorialSiniestros<T extends { fechaHora: Date | null }>(
  siniestros: readonly T[],
): T[] {
  return [...siniestros].sort((a, b) => {
    if (a.fechaHora === null && b.fechaHora === null) return 0
    if (a.fechaHora === null) return 1
    if (b.fechaHora === null) return -1
    return b.fechaHora.getTime() - a.fechaHora.getTime()
  })
}

/**
 * Cuántos hay de cada cosa, para el titular de la sección.
 *
 * `total === 0` significa **«no nos consta ninguno»**, y quien lo pinte tiene
 * que decirlo con esas palabras: la compañía informa los siniestros por EIAC y
 * puede no haberlo hecho. «No has tenido ningún siniestro» es una afirmación
 * sobre la vida de alguien que nadie ha comprobado.
 */
export function resumirHistorialSiniestros(
  siniestros: readonly { estado: string }[],
): { total: number; abiertos: number; cerrados: number; rechazados: number } {
  let abiertos = 0
  let cerrados = 0
  let rechazados = 0
  for (const s of siniestros) {
    const tono = tonoEstadoSiniestro(s.estado)
    if (tono === 'abierto') abiertos++
    else if (tono === 'rechazado') rechazados++
    else cerrados++
  }
  return { total: siniestros.length, abiertos, cerrados, rechazados }
}
