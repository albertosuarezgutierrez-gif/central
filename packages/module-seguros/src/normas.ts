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
// Abriendo la fuente (el texto consolidado del BOE; sin red, la copia de
// `docs/normativa/`), leyendo el artículo
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
  // Leído el 23/09/2026 en la misma copia del PDF consolidado del BOE
  // (`docs/normativa/`), artículo dieciséis completo.
  {
    id: 'lcs-16',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '16',
    sintesis:
      'El siniestro debe comunicarse al asegurador en un plazo máximo de siete días desde que se conoce, salvo que la póliza fije uno más amplio; si no se hace, el asegurador puede reclamar los daños y perjuicios que cause esa falta de declaración.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-09-23',
    cubre: ['articulo:16', 'ley:50/1980'],
  },
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
  // 🚨 Los dos siguientes se leyeron el 23/09/2026 en el PDF del texto
  // consolidado del BOE («Última modificación: 25 de julio de 2025») que subió
  // Alberto, porque boe.es no era alcanzable desde la sesión. Antes se probó a
  // pedir el texto a otro asistente y devolvió un art. 73 INVENTADO —llamaba
  // «delimitadoras» a lo que la ley llama «limitativas» y añadía un párrafo que
  // no existe—: es exactamente el error que esta lista está para impedir.
  {
    id: 'lcs-3',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '3',
    sintesis:
      'Las cláusulas limitativas de los derechos de los asegurados deben destacarse de modo especial en la póliza y ser específicamente aceptadas por escrito.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-09-23',
    cubre: ['articulo:3', 'ley:50/1980'],
  },
  {
    id: 'lcs-73',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '73',
    sintesis:
      'En el seguro de responsabilidad civil se admiten, como cláusulas limitativas sujetas al artículo 3, las que limitan la cobertura a reclamaciones presentadas hasta al menos un año después del fin del contrato, o a reclamaciones presentadas durante su vigencia si cubren hechos anteriores de al menos un año antes de su inicio.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-09-23',
    cubre: ['articulo:73', 'ley:50/1980'],
  },
  // Leídos el 17/10/2026 en la copia consolidada del BOE de `docs/normativa/`
  // («Última modificación: 25 de julio de 2025»): arts. 8, 11, 26-32 completos.
  {
    id: 'lcs-8',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '8',
    sintesis:
      'La póliza debe contener, como mínimo, la naturaleza del riesgo cubierto con las exclusiones y limitaciones de cada garantía destacadas tipográficamente, los objetos asegurados, la suma asegurada o alcance de la cobertura, la prima y la duración del contrato.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-10-17',
    cubre: ['articulo:8', 'ley:50/1980'],
  },
  {
    id: 'lcs-11',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '11',
    sintesis:
      'Durante la vigencia del contrato, el tomador o el asegurado deben comunicar al asegurador, tan pronto como les sea posible, la alteración de las circunstancias declaradas que agrave el riesgo en los términos que fija la ley.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-10-17',
    cubre: ['articulo:11', 'ley:50/1980'],
  },
  {
    id: 'lcs-26',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '26',
    sintesis:
      'El seguro no puede ser objeto de enriquecimiento injusto para el asegurado; para determinar el daño se atiende al valor del interés asegurado en el momento inmediatamente anterior al siniestro.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-10-17',
    cubre: ['articulo:26', 'ley:50/1980'],
  },
  {
    id: 'lcs-27',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '27',
    sintesis:
      'La suma asegurada representa el límite máximo de la indemnización que el asegurador debe pagar en cada siniestro.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-10-17',
    cubre: ['articulo:27', 'ley:50/1980'],
  },
  {
    id: 'lcs-28',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '28',
    sintesis:
      'Las partes, de común acuerdo, pueden fijar en la póliza o con posterioridad el valor del interés asegurado que se tendrá en cuenta para calcular la indemnización (póliza estimada); el asegurador solo puede impugnarlo en los supuestos que la ley señala.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-10-17',
    cubre: ['articulo:28', 'ley:50/1980'],
  },
  {
    id: 'lcs-29',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '29',
    sintesis:
      'Si por pacto expreso la suma asegurada cubre plenamente el valor del interés durante la vigencia del contrato, la póliza debe contener los criterios y el procedimiento para adecuar la suma asegurada y las primas a las oscilaciones de ese valor.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-10-17',
    cubre: ['articulo:29', 'ley:50/1980'],
  },
  {
    id: 'lcs-30',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '30',
    sintesis:
      'Si en el momento del siniestro la suma asegurada es inferior al valor del interés, el asegurador indemniza el daño causado en la misma proporción en que aquella cubre el interés asegurado; las partes pueden excluir esta regla por pacto, en la póliza o después de celebrado el contrato.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-10-17',
    cubre: ['articulo:30', 'ley:50/1980'],
  },
  {
    id: 'lcs-31',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '31',
    sintesis:
      'Si la suma asegurada supera notablemente el valor del interés, cualquiera de las partes puede exigir la reducción de la suma y de la prima, y si hay siniestro el asegurador indemniza el daño efectivamente causado; si el sobreseguro se debe a mala fe del asegurado, el contrato es ineficaz.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-10-17',
    cubre: ['articulo:31', 'ley:50/1980'],
  },
  {
    id: 'lcs-32',
    norma: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    articulo: '32',
    sintesis:
      'Cuando varios contratos con distintos aseguradores cubren el mismo riesgo sobre el mismo interés y durante el mismo período, el tomador o el asegurado deben, salvo pacto en contrario, comunicar a cada asegurador los demás seguros; los aseguradores contribuyen al pago de la indemnización en proporción a su suma asegurada, sin superar el daño.',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    verificado: '2026-10-17',
    cubre: ['articulo:32', 'ley:50/1980'],
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
