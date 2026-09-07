// Las normas que la correduría PUEDE citar, y solo esas.
//
// ─── Por qué existe ────────────────────────────────────────────────────────
// El blog de `apps/asegura-web` ya tiene un cepo que exige declarar `base`
// cuando un artículo nombra una norma. Ese cepo comprueba que la declaración
// EXISTA; no comprueba que sea CIERTA. Con los tres artículos escritos a mano
// bastaba —los verifiqué contra el BOE antes de publicarlos—, pero en cuanto un
// agente redacte los siguientes deja de bastar: un modelo que escribe sobre
// plazos de la Ley de Contrato de Seguro acierta casi siempre, y el «casi» es
// alguien que no renueva su póliza a destiempo porque lo leyó en la web de su
// corredor.
//
// Un número de artículo inventado es peor que no citar ninguno: parece
// autoridad. Y es la clase de error que NO se ve — el texto queda plausible,
// el test verde y el enlace al BOE, si nadie lo pone, tampoco delata nada.
//
// Por eso la lista es blanca y no negra: un artículo solo puede mencionar una
// norma si esa norma está aquí, verificada contra su fuente, con la fecha en
// que se leyó. Lo que no está, no se cita: se pide que se añada.
//
// ─── Cómo se amplía ────────────────────────────────────────────────────────
// Abriendo la fuente (el texto consolidado del BOE), leyendo el artículo
// entero, y escribiendo aquí la síntesis con la fecha de esa lectura. No se
// añade una norma «de memoria» ni copiando de otra web: el valor de esta lista
// es exactamente el de la comprobación que hay detrás.

/** Una norma verificada, lista para citarse. */
export type NormaCitable = {
  /** Clave estable. Es lo que los artículos declaran en su `base`. */
  id: string
  /** Nombre completo, tal y como se publica. */
  norma: string
  /** Número de artículo, si la cita es a un artículo concreto. */
  articulo?: string
  /** Qué dice, en una frase. Es lo que se pinta bajo «Normativa citada». */
  sintesis: string
  /** Texto consolidado en el BOE. Va como enlace en la página. */
  url: string
  /**
   * Fecha (AAAA-MM-DD) en que se leyó la fuente para escribir la síntesis.
   * No es decorativa: una norma se modifica, y esta fecha es lo que permite
   * saber contra qué versión se comprobó.
   */
  verificado: string
  /**
   * Las menciones que esta norma AUTORIZA en el texto de un artículo.
   * Ver `mencionesNormativas`: si el texto dice «el artículo 22» y ninguna
   * norma declarada lo cubre, el artículo cita algo que nadie ha verificado.
   */
  cubre: readonly string[]
}

/**
 * 🚨 Verificadas contra el texto consolidado del BOE el 07/09/2026, una a una,
 * antes de escribir los tres primeros artículos del blog. Ampliar esta lista
 * exige repetir esa lectura; copiar de un resumen ajeno, no.
 */
export const NORMAS_CITABLES: readonly NormaCitable[] = [
  {
    id: 'lcs-18',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '18',
    sintesis:
      'El asegurador debe pagar el importe mínimo de lo que pueda deber dentro de los cuarenta días siguientes a la declaración del siniestro, aunque la peritación no haya terminado.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-09-07',
    cubre: ['articulo:18', 'ley:50/1980'],
  },
  {
    id: 'lcs-20',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '20',
    sintesis:
      'Si el asegurador incurre en mora, la indemnización devenga el interés legal del dinero incrementado en un 50 %; transcurridos dos años desde el siniestro, ese interés no puede ser inferior al 20 % anual.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-09-07',
    cubre: ['articulo:20', 'ley:50/1980'],
  },
  {
    id: 'lcs-22',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '22',
    sintesis:
      'El contrato se prorroga salvo oposición. El tomador debe comunicarla con al menos un mes de antelación al vencimiento; el asegurador, con dos meses.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-09-07',
    cubre: ['articulo:22', 'ley:50/1980'],
  },
  {
    id: 'lcs-23',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '23',
    sintesis:
      'Las acciones derivadas del contrato de seguro prescriben a los dos años en los seguros de daños y a los cinco en los de personas.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-09-07',
    cubre: ['articulo:23', 'ley:50/1980'],
  },
  {
    id: 'orden-ecc-2502-2012',
    norma:
      'Orden ECC/2502/2012, de 16 de noviembre, por la que se regula el procedimiento de presentación de reclamaciones ante los servicios de reclamaciones del Banco de España, la Comisión Nacional del Mercado de Valores y la Dirección General de Seguros y Fondos de Pensiones',
    sintesis:
      'Antes de reclamar ante el Servicio de Reclamaciones de la DGSFP hay que dirigirse al servicio de atención al cliente de la entidad, que dispone de dos meses para contestar.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2012-14449',
    verificado: '2026-09-07',
    cubre: ['orden:ECC/2502/2012'],
  },
] as const

/** La norma con ese id, o `null`. No inventa: un id desconocido es un error. */
export function normaPorId(id: string): NormaCitable | null {
  return NORMAS_CITABLES.find((n) => n.id === id) ?? null
}

/** Cómo se cita en la página, bajo «Normativa citada». */
export function citaLegible(n: NormaCitable): string {
  return n.articulo ? `Artículo ${n.articulo} de la ${n.norma}. ${n.sintesis}` : `${n.norma}. ${n.sintesis}`
}

/**
 * Toda mención con forma de norma que aparece en un texto, normalizada.
 *
 * Devuelve claves comparables con el campo `cubre` de las normas:
 * `articulo:22`, `ley:50/1980`, `orden:ECC/2502/2012`, `rdl:3/2020`.
 *
 * 🚨 Detecta la FORMA, no el sentido. Es a propósito: el trabajo de esta
 * función no es entender el texto, es no dejar pasar ninguna mención sin que
 * alguien la haya respaldado. Un falso positivo cuesta añadir una norma a la
 * lista; un falso negativo es una cita inventada publicada.
 *
 * «este artículo informa con carácter general» NO casa: el patrón exige un
 * número detrás.
 */
export function mencionesNormativas(texto: string): string[] {
  const encontradas = new Set<string>()

  for (const m of texto.matchAll(/\b(?:art[íi]culos?|arts?\.)\s+(\d+)/gi)) {
    encontradas.add(`articulo:${m[1]}`)
  }
  // «artículos 18 y 20», «artículos 18, 20 y 23»: el patrón de arriba solo
  // coge el primero, así que las enumeraciones se recorren aparte.
  for (const m of texto.matchAll(/\b(?:art[íi]culos|arts?\.)\s+[\d,\s]*\d\s+y\s+(\d+)/gi)) {
    encontradas.add(`articulo:${m[1]}`)
  }
  for (const m of texto.matchAll(/\b(?:art[íi]culos|arts?\.)\s+(\d+)\s*,\s*(\d+)/gi)) {
    encontradas.add(`articulo:${m[1]}`)
    encontradas.add(`articulo:${m[2]}`)
  }
  for (const m of texto.matchAll(/\bLey\s+(\d+\/\d{4})/gi)) {
    encontradas.add(`ley:${m[1]}`)
  }
  for (const m of texto.matchAll(/\bOrden\s+([A-Z]{2,4}\/\d+\/\d{4})/g)) {
    encontradas.add(`orden:${m[1]}`)
  }
  for (const m of texto.matchAll(/\bReal\s+Decreto-ley\s+(\d+\/\d{4})/gi)) {
    encontradas.add(`rdl:${m[1]}`)
  }

  return [...encontradas].sort()
}

/**
 * Las menciones del texto que NINGUNA de las normas declaradas respalda.
 *
 * Vacío = todo lo que el texto cita está verificado. Con contenido = el
 * artículo no se publica: o se añade la norma a la lista (leyéndola), o se
 * quita la cita.
 */
export function citasNoRespaldadas(texto: string, base: readonly string[]): string[] {
  const cubierto = new Set<string>()
  for (const id of base) {
    const n = normaPorId(id)
    if (n) for (const c of n.cubre) cubierto.add(c)
  }
  return mencionesNormativas(texto).filter((m) => !cubierto.has(m))
}

/** Ids declarados que no existen en la lista. Un `base` que no se puede resolver. */
export function idsDesconocidos(base: readonly string[]): string[] {
  return base.filter((id) => normaPorId(id) === null)
}
