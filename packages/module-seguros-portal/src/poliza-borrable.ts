/**
 * ¿Puede el CLIENTE quitar de su bóveda una póliza que añadió él, y qué hay que
 * hacer antes con los partes de siniestro que colgaban de ella?
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
 * 🚨 EL PARTE DE SINIESTRO NO ES UN DATO DE LA PÓLIZA: ES UNA COMUNICACIÓN.
 *
 * Un parte es la prueba de que esa persona nos contó un siniestro y de CUÁNDO
 * (art. 16 LCS, siete días). Por eso no se va con la póliza:
 *
 *   · La FK `portal_parte_siniestro.poliza_declarada_id` es `ON DELETE SET NULL`
 *     (`prisma/sql/2026-09-03_portal_parte_siniestro.sql`), así que un borrado
 *     a secas NO falla: deja el parte apuntando a nada —el CHECK admite las dos
 *     columnas de póliza nulas— y la correduría se queda con un siniestro que no
 *     habla de ninguna póliza. Un fallo que no rompe nada y que nadie ve.
 *   · Y una cascada tampoco vale: borraría la fecha de comunicación, y con ella
 *     lo único que hay que enseñar el día que se discuta si se avisó a tiempo.
 *
 * La salida es la tercera: **congelar y desligar**. Antes de borrar la póliza,
 * sus datos identificativos (compañía, número, ramo) se copian DENTRO del parte
 * como texto. El parte sobrevive legible, la póliza desaparece de la bóveda, y
 * nadie pierde la prueba. Eso es `PARA_DESLIGAR`.
 *
 * 🚨 Con UNA excepción que siempre bloquea: el parte que la compañía YA está
 * tramitando (`abierto_en_compania`, o con `siniestroId`). Ahí hay un expediente
 * vivo con un tercero, y el cliente no lo cierra él solo desde una pantalla: nos
 * llama. Que ese estado sea terminal en la máquina de estados del corredor no es
 * casualidad — es la misma frontera.
 */

/** El estado de un parte, con el vocabulario de la BD (`portal_parte_estado`). */
export type EstadoParteBorrado = 'enviado' | 'recibido' | 'abierto_en_compania' | 'descartado'

/** Lo que hay que saber de un parte para decidir. Nada más: ni descripción ni fechas. */
export interface ParteDePoliza {
  estado: EstadoParteBorrado
  /** El siniestro REAL en la compañía. No nulo = hay expediente abierto fuera. */
  siniestroId: string | null
}

/** Lo único que hoy impide quitar una póliza aportada. */
export type ReparoBorrado = 'parte_en_compania'

export type Borrabilidad =
  | { puede: true; partesADesligar: number }
  | { puede: false; reparo: ReparoBorrado; mensaje: string }

/**
 * Los textos viven aquí porque los dicen DOS sitios: la API (en su 409) y la
 * pantalla. Dos redacciones del mismo motivo acaban divergiendo, y entonces lo
 * que lee quien usa el portal depende de por dónde llegó.
 */
export const MENSAJE_PARTE_EN_COMPANIA =
  'No podemos quitarla: hay un siniestro de esta póliza que la compañía está tramitando. ' +
  'Escríbenos y lo vemos contigo.'

/**
 * Un parte está EN LA COMPAÑÍA si el corredor ya lo abrió allí o si consta el
 * siniestro real. Se miran las dos cosas y no solo el estado: el `siniestroId`
 * puede llegar por otra vía, y basta uno de los dos para que haya un tercero
 * esperando.
 */
export function parteEnCompania(p: ParteDePoliza): boolean {
  return p.estado === 'abierto_en_compania' || p.siniestroId !== null
}

/**
 * `partes` son TODOS los partes que cuelgan de esa póliza, en cualquier estado.
 * También cuentan los descartados: un parte descartado sigue siendo algo que esa
 * persona nos contó, así que se congela igual — lo que no se hace nunca es
 * borrarlo.
 */
export function puedeBorrarDeclarada(entrada: { partes: ParteDePoliza[] }): Borrabilidad {
  if (entrada.partes.some(parteEnCompania)) {
    return { puede: false, reparo: 'parte_en_compania', mensaje: MENSAJE_PARTE_EN_COMPANIA }
  }
  return { puede: true, partesADesligar: entrada.partes.length }
}

/**
 * Lo que la pantalla le dice a quien está a punto de confirmar, cuando esa
 * póliza tenía partes. No es decoración: sin esta frase, alguien que declaró un
 * siniestro puede creer que al quitar la póliza retira también el parte, que es
 * justo lo contrario de lo que pasa.
 *
 * `0` devuelve `null` —no hay nada que contar— y no una cadena vacía, que la
 * pantalla pintaría como un hueco.
 */
export function avisoPartesConservados(cuantos: number): string | null {
  if (cuantos <= 0) return null
  return cuantos === 1
    ? 'El parte de siniestro que declaraste sobre ella NO se borra: lo conservamos con los datos de la póliza para que siga teniendo sentido.'
    : `Los ${cuantos} partes de siniestro que declaraste sobre ella NO se borran: los conservamos con los datos de la póliza para que sigan teniendo sentido.`
}

/**
 * Lo que se copia DENTRO del parte antes de que la póliza desaparezca. Es una
 * FOTO en texto, no una relación: por eso vale aunque la fila de origen ya no
 * exista, que es exactamente el punto.
 */
export interface FotoPolizaDesligada {
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
}

/**
 * 🚨 Si la póliza no tenía NI compañía NI número NI ramo, no se escribe una foto
 * vacía: se devuelve `null`. Tres columnas a `null` y «no se rellenaron nunca»
 * se leen igual en la BD, pero una foto vacía afirma que se miró y no había —
 * y quien lea el parte tiene que poder distinguir «la póliza no decía nada» de
 * «este parte es anterior al desligado». La fecha (`poliza_desligada_at`) es la
 * que responde a eso, y por eso se escribe SIEMPRE que se desliga.
 */
export function fotoDeLaPoliza(p: FotoPolizaDesligada): FotoPolizaDesligada | null {
  const limpio = {
    compania: vacioANulo(p.compania),
    numeroPoliza: vacioANulo(p.numeroPoliza),
    ramo: vacioANulo(p.ramo),
  }
  if (limpio.compania === null && limpio.numeroPoliza === null && limpio.ramo === null) return null
  return limpio
}

/** `''` y `'   '` son «no lo sé» escritos con espacios: nunca se guardan como dato. */
function vacioANulo(v: string | null): string | null {
  if (v === null) return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * Cómo se nombra en pantalla una póliza que ya no existe. Se usa en la bandeja
 * del corredor, donde el parte tiene que seguir diciendo DE QUÉ habla.
 *
 * `null` cuando no hay foto: la pantalla dirá «la quitó de su bóveda» sin
 * inventarse una compañía.
 */
export function describirPolizaDesligada(foto: FotoPolizaDesligada | null): string | null {
  if (foto === null) return null
  const partes = [foto.compania, foto.ramo].filter((x): x is string => x !== null)
  const cabeza = partes.length > 0 ? partes.join(' · ') : 'Póliza sin compañía identificada'
  return foto.numeroPoliza === null ? cabeza : `${cabeza} · nº ${foto.numeroPoliza}`
}
