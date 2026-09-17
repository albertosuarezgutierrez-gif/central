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

// ─── Lo que pasó y dónde (07/09/2026) ────────────────────────────────────────
//
// Alberto: «también dar acceso a toda la información de los siniestros». Hasta
// ese día el historial decía CUÁNDO · EN QUÉ ESTADO · CON QUÉ REFERENCIA, o
// sea todo menos lo único que a alguien le importa de un siniestro suyo: **qué
// pasó**.
//
// 🚨 Medido en la cartera antes de escribir esto (69 siniestros): `comentario`
// está informado en 66, y el lugar en 8. Todo lo demás que sonaba a «más
// información» está VACÍO en las 69 filas — `gravedad`, los dos importes,
// `se_considera_culpable`, y también `tramitador_*` y `perito_*` (o sea, la
// regla del 03/09 que los oculta hoy no tapa ningún dato: no hay ninguno).
//
// ⚠️ Y `comentario` NO es un campo saneado: lo escribe el tramitador para uso
// interno y en la cartera real contiene nombres y teléfonos de TERCEROS
// («Inquilino piso 5: …»). Alberto decidió el 07/09/2026, con esos ejemplos
// delante, publicarlo a todo el que ya puede ver siniestros. Lo que hace este
// módulo es lo único que se puede hacer sin inventar: no tocar el texto —
// recortarlo por la mitad daría un relato falso, y «limpiarlo» con una heurística
// borraría datos buenos y dejaría pasar los malos.

import { provinciaPorCp } from '@central/module-seguros'

/**
 * DÓNDE pasó, en una línea legible.
 *
 * Dos traducciones, y las dos vienen de mirar la BD:
 *
 * - **La provincia es un CÓDIGO** (`41`, `11`), no un nombre. Pintarlo crudo
 *   daría «SEVILLA · 41», que parece un número de expediente. Se traduce con la
 *   MISMA tabla que ya usa la ficha del cliente (`provinciaPorCp` de
 *   `@central/module-seguros`), en vez de escribir aquí una segunda lista de 52
 *   provincias que divergiría de la primera.
 * - **La ciudad viene en MAYÚSCULAS** («ALCALA DE GUADAIRA», «DOS HERMANAS»),
 *   que es como la manda la compañía. Se pasa a capital inicial dejando en
 *   minúscula las partículas: no se corrigen acentos que la fuente no trae —
 *   inventarse «Alcalá» es tan fácil como inventarse la provincia equivocada.
 *
 * `null` = no consta ninguna de las dos. Un lugar a medias (solo provincia) SÍ
 * se devuelve: «Sevilla» es menos que «Dos Hermanas (Sevilla)» pero no es falso.
 */
export function lugarSiniestro(l: {
  ciudad?: string | null
  provincia?: string | null
}): string | null {
  const ciudad = nombreDeLugar(l.ciudad)
  const provincia = nombreDeProvincia(l.provincia)
  if (ciudad === null) return provincia
  if (provincia === null || provincia.toLowerCase() === ciudad.toLowerCase()) return ciudad
  return `${ciudad} (${provincia})`
}

/** Partículas que se quedan en minúscula dentro de un topónimo. */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en', 'a'])

function nombreDeLugar(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  if (t === '') return null
  // Solo se re-capitaliza lo que viene TODO en mayúsculas, que es lo que manda
  // la compañía. Un «A Coruña» ya bien escrito se deja como está.
  if (t !== t.toUpperCase()) return t
  return t
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((parte, i) =>
      /^\s+$|^-$/.test(parte) || (i > 0 && PARTICULAS.has(parte))
        ? parte
        : parte.charAt(0).toUpperCase() + parte.slice(1),
    )
    .join('')
}

/**
 * El código de provincia (`41`) → su nombre. Acepta también un nombre ya
 * escrito, que es lo que traería una póliza aportada.
 */
function nombreDeProvincia(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  if (t === '') return null
  if (/^\d{1,2}$/.test(t)) return provinciaPorCp(t.padStart(2, '0'))
  return nombreDeLugar(t)
}

/**
 * QUÉ pasó, tal cual lo escribió quien lo tramitó.
 *
 * Solo quita el vacío y los valores de cajón: un `''` o un `'-'` que llegue de
 * la compañía es «no lo contó», y pintado como descripción sería un renglón en
 * blanco con aspecto de dato. **El texto no se recorta ni se reescribe**: media
 * frase de un siniestro es un relato distinto, y este es el campo por el que
 * alguien llama para preguntar.
 */
export function descripcionSiniestro(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  if (t === '') return null
  return /^[-–—.·_]+$/.test(t) ? null : t
}
