/**
 * ¿Puede el CLIENTE quitar de su bóveda una póliza que añadió él?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LA LÍNEA QUE SEPARA LAS DOS LISTAS, Y POR QUÉ ES ESTRUCTURAL.
 *
 * En «Mis seguros» conviven dos cosas que para quien mira son lo mismo —«un
 * seguro»— y que para la casa no lo son:
 *
 *   · Las de la CARTERA (entran por CIMA). Son el registro de la correduría:
 *     el cliente NO las borra. No hay un permiso que se lo impida; es que no
 *     hay ninguna ruta que las escriba — el portal las lee y punto.
 *   · Las que APORTA él (`portal_poliza_declarada`, chip «Añadida por ti»).
 *     Esas son suyas: las subió para tenerlas a mano, y si se equivocó al
 *     subirlas o ya no le sirven, tiene que poder quitarlas. Dictado de
 *     Alberto (07/09/2026): *«las que no son nuestras el cliente sí puede,
 *     que se puede confundir»*.
 *
 * Por eso el borrado vive SOLO sobre la tabla de las declaradas, y este módulo
 * no tiene ni un caso para la cartera: lo que no se puede expresar no se puede
 * colar por un `if` mal escrito.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🚨 Y hay un reparo que no es de permisos, sino de INTEGRIDAD: la FK de
 * `portal_parte_siniestro.poliza_declarada_id` es `ON DELETE SET NULL`
 * (`prisma/sql/2026-09-03_portal_parte_siniestro.sql`). O sea, borrar una
 * póliza con un parte declarado NO falla: deja el parte **huérfano**, con las
 * dos columnas de póliza a `null` —el CHECK las admite así— y la correduría se
 * queda con un siniestro que no habla de nada. Un fallo que no rompe nada y que
 * nadie ve. Así que un parte bloquea el borrado, y se dice por qué.
 */

/** Lo único que hoy impide quitar una póliza aportada. */
export type ReparoBorrado = 'parte_siniestro'

export type Borrabilidad =
  | { puede: true }
  | { puede: false; reparo: ReparoBorrado; mensaje: string }

/**
 * El texto es UNO y vive aquí porque lo dicen dos sitios: el 409 de la API y la
 * pantalla. Dos redacciones del mismo reparo acaban divergiendo, y entonces lo
 * que lee quien usa el portal depende de por dónde llegó.
 */
export const MENSAJE_PARTE_SINIESTRO =
  'No podemos quitarla: has declarado un siniestro sobre esta póliza y el parte quedaría sin ' +
  'referencia. Escríbenos y lo vemos contigo.'

/**
 * `partes` es cuántos partes de siniestro apuntan a esa póliza, en CUALQUIER
 * estado. También cuentan los descartados: un parte descartado sigue siendo
 * algo que esa persona nos contó, y sin la póliza detrás deja de poder leerse.
 */
export function puedeBorrarDeclarada(entrada: { partes: number }): Borrabilidad {
  if (entrada.partes > 0) {
    return { puede: false, reparo: 'parte_siniestro', mensaje: MENSAJE_PARTE_SINIESTRO }
  }
  return { puede: true }
}
