/**
 * La HOJA de la nevera y su QR.
 *
 * Alberto quería «la hoja del frigorífico»: lo que hace falta después de un
 * percance —compañía, nº de póliza, qué está asegurado y a quién llamar— en un
 * papel, con un QR al lado. Y decidió su forma el 05/09/2026: *«crear QR y ahí
 * seleccionas si todas las pólizas, una o algunas… y luego se crea el QR»*, con
 * *«el qr se puede borrar y se anularía el acceso»*.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LAS CUATRO REGLAS QUE SOSTIENEN ESTO. Ninguna es cosmética:
 *
 * 1. **El QR lleva un ENLACE, no los datos.** Un QR no caduca —es una imagen
 *    con un texto dentro— pero lo que se mete dentro sí: con los datos escritos,
 *    la imagen miente en cuanto cambie la póliza, y encima cualquiera que
 *    fotografíe la hoja se los lleva. Con una URL, la imagen es permanente y la
 *    página detrás está siempre al día.
 *
 * 2. **Lo que enseña se lee EN VIVO y se vuelve a filtrar por la cartera actual
 *    de su dueño.** La selección dice QUÉ pólizas se eligieron, no CUÁLES son
 *    sus datos. Si se vende el coche y esa póliza deja de ser suya, desaparece
 *    de la hoja sola. Guardar una foto de los datos al crear el QR es
 *    exactamente cómo un imán de nevera acaba mintiendo a los seis meses.
 *
 * 3. **`polizas: null` = TODAS, y eso incluye las FUTURAS.** Es el mismo
 *    vocabulario que `portal_autorizacion.poliza_id`. Para una hoja de nevera
 *    suele ser lo que se quiere —que siga valiendo al cambiar de coche— pero
 *    **la pantalla tiene que decirlo al crear**, no dejar que se descubra solo.
 *
 * 4. **Anular no borra la fila.** Quien tenga la hoja vieja tiene que poder
 *    distinguir «esto ya no vale» de «esto no ha existido nunca»: lo primero se
 *    dice, lo segundo asusta. Y la fecha de anulación es la única prueba de
 *    cuándo dejó de dar acceso.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔐 **Por qué un token de solo lectura es aceptable aquí, y no lo sería en
 * general.** La objeción obvia es «quien fotografíe la hoja entra». Cierto — y
 * da igual: **entra a ver exactamente lo que ya está impreso en esa misma
 * hoja**, porque la selección del QR y lo que se imprime son la misma lista. El
 * papel es la premisa; el token no añade filtración sobre el papel. Lo que sí
 * haría daño es un QR que abriera la cartera ENTERA, y por eso la selección no
 * es un adorno: es la que acota el token.
 */

/** Bytes de aleatoriedad del token. 32 → 64 caracteres hex. */
export const BYTES_TOKEN_HOJA = 32

/** Cuántos QR puede tener vivos una identidad a la vez. */
export const MAX_HOJAS_VIVAS = 20

/** Largo máximo del nombre con el que se distinguen entre sí («Coche de Pilar»). */
export const MAX_NOMBRE_HOJA = 60

/**
 * Normaliza un token que llega por la URL. Devuelve `null` si no tiene la forma
 * exacta —64 caracteres hex— **sin llegar a mirar la base de datos**: así una
 * URL manipulada no gasta ni una consulta.
 */
export function normalizarTokenHoja(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(t) ? t : null
}

/**
 * Normaliza el nombre de una hoja. `null` = sin nombre, que es válido: la hoja
 * se identifica igual por su fecha y por lo que lleva dentro.
 */
export function normalizarNombreHoja(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t === '' ? null : t.slice(0, MAX_NOMBRE_HOJA)
}

export type EstadoHoja = 'viva' | 'anulada'

export function estadoHoja(h: { anuladaEn: Date | null }): EstadoHoja {
  return h.anuladaEn === null ? 'viva' : 'anulada'
}

/**
 * La selección de pólizas de una hoja, tal y como llega del formulario.
 *
 * `null` = todas (regla 3). Una lista vacía **NO es «todas»**: es un formulario
 * mal enviado, y por eso `seleccionHoja()` la rechaza en vez de interpretarla —
 * colapsarla en «todas» convertiría un despiste en el acceso más amplio posible,
 * que es justo la dirección en la que no se puede fallar.
 */
export type SeleccionHoja = { todas: true } | { todas: false; polizaIds: string[] }

export type ErrorSeleccion = 'sin_seleccion' | 'ok'

export function seleccionHoja(todas: unknown, ids: unknown): { sel: SeleccionHoja | null; error: ErrorSeleccion } {
  if (todas === true) return { sel: { todas: true }, error: 'ok' }
  const lista = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  const unicos = [...new Set(lista.map((x) => x.trim()))]
  if (unicos.length === 0) return { sel: null, error: 'sin_seleccion' }
  return { sel: { todas: false, polizaIds: unicos }, error: 'ok' }
}

/**
 * Qué pólizas de las que HOY son suyas entran en esta hoja.
 *
 * 🚨 Es la regla 2 hecha función, y el orden importa: se parte SIEMPRE de lo
 * que la persona puede ver ahora (`suyas`) y la selección solo FILTRA. Al revés
 * —recorrer la selección y buscar cada id— una póliza que dejó de ser suya
 * seguiría en la hoja mientras nadie borrara el QR.
 *
 * Por eso también una selección con ids que ya no existen no es un error: son
 * pólizas que se fueron. Devuelve las que quedan y quien pinte dirá si no queda
 * ninguna.
 */
export function polizasDeLaHoja<T extends { id: string }>(
  suyas: readonly T[],
  seleccion: SeleccionHoja,
): T[] {
  if (seleccion.todas) return [...suyas]
  const elegidas = new Set(seleccion.polizaIds)
  return suyas.filter((p) => elegidas.has(p.id))
}

/**
 * Qué se le dice a quien escanea, en las tres situaciones que existen.
 *
 * 🚨 `anulada` y `no_existe` **se dicen distinto a propósito**, y es lo
 * contrario de lo que pide el instinto de seguridad. Aquí no hay nada que
 * enumerar —un token de 256 bits no se adivina— y quien tiene la hoja en la
 * mano necesita saber si su papel caducó o si escaneó mal: «no existe» ante un
 * QR anulado le haría pensar que el fallo es del móvil y volver a intentarlo
 * en el peor momento.
 *
 * `vacia` es el tercer caso y tampoco se colapsa: la hoja vale, pero de lo que
 * llevaba ya no queda nada suyo. Decir «anulada» ahí sería culpar a quien la
 * imprimió de algo que hizo la compañía.
 */
export function loQueVeQuienEscanea(
  hoja: { anuladaEn: Date | null } | null,
  cuantasPolizas: number,
): 'no_existe' | 'anulada' | 'vacia' | 'hoja' {
  if (hoja === null) return 'no_existe'
  if (estadoHoja(hoja) === 'anulada') return 'anulada'
  return cuantasPolizas === 0 ? 'vacia' : 'hoja'
}
