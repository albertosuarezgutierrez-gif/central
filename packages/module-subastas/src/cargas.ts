// ────────────────────────────────────────────────────────────────────────────
// CARGAS REGISTRALES. Módulo PURO: tipos, prompt del especialista, parseo de la
// respuesta de la IA y —lo importante— la regla determinista de QUÉ CARGA
// SUBSISTE para quien se adjudica el inmueble.
//
// Por qué esto es el núcleo del riesgo: la ficha del BOE casi nunca publica las
// cargas en su campo «Cargas»; viven en la CERTIFICACIÓN DE DOMINIO Y CARGAS que
// va adjunta, y muy a menudo como PDF escaneado. Sin leerla, el «descuento del
// 55%» que pinta la UI puede ser en realidad una pérdida.
//
// 🚨 Caso real que motiva este módulo (SUB-JA-2026-264269, Belmonte de Miranda,
// leído el 30/07/2026): se subasta por una ANOTACIÓN DE EMBARGO de 5.397€, pero
// la finca arrastra una HIPOTECA de 2009 con 44.850€ de responsabilidad inscrita
// ANTES de esa anotación. En una ejecución por embargo las cargas anteriores NO
// se purgan (arts. 668/670 LEC): el adjudicatario las hereda. Salida 19.329€ +
// 44.850€ de hipoteca ≈ 64.000€ por un inmueble tasado en 50.000€. De chollo a
// ruina, y la ficha lo anunciaba como «Cargas no publicadas».
//
// De ahí la asimetría deliberada de este módulo: la IA puede leer y estructurar,
// pero QUIÉN SUBSISTE lo decide código determinista y testeado, porque de eso
// depende la puja máxima.
// ────────────────────────────────────────────────────────────────────────────

import { caducidadDelCuadro } from './caducidad.ts'
import type { MuroDocumental } from './edicto.ts'
import { norm, parseImporteEs } from './parsing.ts'
import { numeroAlFinal, palabrasANumero } from './numeros-es.ts'

/**
 * Confianza mínima de la lectura para poder afirmar que una finca se adquiere
 * LIBRE de cargas. Por debajo, la ausencia de cargas se lee como «no se sabe».
 */
export const CONFIANZA_MINIMA_LIBRE = 0.5

/** Naturaleza de la carga. `otra` es válida: no se fuerza una taxonomía cerrada. */
export type TipoCarga =
  | 'hipoteca'
  | 'embargo'
  | 'afeccion_fiscal'
  | 'servidumbre'
  | 'usufructo'
  | 'condicion_resolutoria'
  | 'censo'
  | 'otra'

/**
 * Rango de la carga RESPECTO A LA QUE SE EJECUTA. Es el dato que decide si se
 * purga o se hereda, más importante que el importe.
 */
export type RangoCarga = 'anterior' | 'posterior' | 'la_que_ejecuta' | 'desconocido'

/** Cómo se obtuvo el cuadro: cambia cuánto hay que fiarse de los importes. */
export type FuenteCargas = 'campo_ficha' | 'texto_documento' | 'ocr_ia' | 'manual'

export interface Carga {
  tipo: TipoCarga
  /** Titular de la carga tal como lo nombra el registro. */
  acreedor: string | null
  /**
   * Responsabilidad TOTAL que garantiza (principal + intereses + costas), que es
   * lo que puede reclamar el acreedor, no solo el principal.
   */
  importe: number | null
  /** Fecha de inscripción/anotación, ISO si se pudo normalizar. */
  fecha: string | null
  rango: RangoCarga
  /** El registro dice expresamente que está cancelada o caducada. */
  cancelada: boolean
  /** Cita literal del documento: la evidencia de dónde sale cada cifra. */
  literal: string | null
  /**
   * Título del documento de la ficha del que salió esta lectura. Es lo que
   * permite arbitrar cuando dos documentos se contradicen: la CERTIFICACIÓN de
   * dominio y cargas es la que establece el orden registral, y una nota simple
   * o un edicto solo lo describen. Ver `autoridadDocumental`.
   */
  documento?: string | null
}

/**
 * Valor que la escritura de hipoteca pactó «a efectos de subasta». Es una
 * TASACIÓN BANCARIA real de la finca, con su año: en Belmonte, 47.274,90€ en
 * 2009. Acumulando estos pares se construye una serie de valoración propia por
 * zona, independiente de los comparables de los portales (que son precios de
 * oferta, no de tasación).
 */
export interface ValoracionPactada {
  importe: number | null
  anio: number | null
}

export interface CuadroCargas {
  cargas: Carga[]
  /** Tasación pactada en la escritura, si la certificación la recoge. */
  valoracionPactada?: ValoracionPactada
  /**
   * Vía por la que se subasta. Determina la purga:
   * `hipotecaria` = ejecución hipotecaria directa (arts. 681 ss. LEC);
   * `embargo` = ejecución ordinaria / títulos judiciales con anotación de embargo.
   */
  procedimiento: 'hipotecaria' | 'embargo' | 'desconocido'
  /** El registro cierra con la fórmula «sin más cargas». */
  sinMasCargas: boolean
  /** Observaciones en texto llano (afecciones vigentes, notas al margen…). */
  notas: string[]
  fuente: FuenteCargas
  /** 0..1 declarada por el lector. Baja = pedir confirmación humana. */
  confianza: number
}

export interface CargasSubsistentes {
  /**
   * Suma de lo que el adjudicatario hereda. `null` = no se puede afirmar.
   * Es SIEMPRE la cifra conservadora: incluye las anotaciones que podrían haber
   * caducado, porque mientras no se confirme la caducidad hay que contar con ellas.
   */
  importe: number | null
  /** Las cargas que subsisten, para poder enseñarlas una a una. */
  cargas: Carga[]
  /** Las que se purgan con la adjudicación (informativo, tranquiliza). */
  purgadas: Carga[]
  /**
   * Anotaciones de embargo que por fecha PODRÍAN estar caducadas (art. 86 LH).
   * Van dentro de `cargas` y dentro de `importe`: esto es solo la marca.
   */
  posiblesCaducadas: Carga[]
  /**
   * Coste si se confirma que esas anotaciones ya no existen — el escenario
   * optimista, que se enseña al lado del conservador, nunca en su lugar.
   * `null` cuando no se puede cuantificar.
   */
  importeSiCaducan: number | null
  avisos: string[]
}

const NUM = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

const TIPOS: TipoCarga[] = ['hipoteca', 'embargo', 'afeccion_fiscal', 'servidumbre', 'usufructo', 'condicion_resolutoria', 'censo', 'otra']
const RANGOS: RangoCarga[] = ['anterior', 'posterior', 'la_que_ejecuta', 'desconocido']

/**
 * Normaliza el JSON del lector a un `CuadroCargas` de confianza. Defensivo a
 * propósito: un LLM puede devolver un tipo inventado, un importe con formato
 * español, o cargas a medias — nada de eso debe lanzar, porque el pipeline es
 * best-effort y una ficha ilegible no puede tumbar la pasada del cron.
 */
export function normalizarCuadroCargas(
  bruto: unknown,
  fuente: FuenteCargas,
  /** Título del documento leído, para poder arbitrar rangos contradictorios. */
  documento?: string | null,
): CuadroCargas {
  const o = (bruto ?? {}) as Record<string, unknown>
  const lista = Array.isArray(o.cargas) ? o.cargas : []

  const cargas: Carga[] = lista.map((c) => {
    const x = (c ?? {}) as Record<string, unknown>
    const tipo = String(x.tipo ?? '').toLowerCase().replace(/\s+/g, '_')
    const rango = String(x.rango ?? '').toLowerCase().replace(/\s+/g, '_')
    return {
      tipo: (TIPOS as string[]).includes(tipo) ? (tipo as TipoCarga) : 'otra',
      acreedor: typeof x.acreedor === 'string' && x.acreedor.trim() ? x.acreedor.trim().slice(0, 200) : null,
      importe: NUM(x.importe),
      // 🚨 El tope era 40 y el registro escribe las fechas EN LETRA: «veintinueve
      // de enero de dos mil dieciocho» son 41 caracteres, así que se guardaba
      // «…dos mil diecioch» y `palabrasANumero` leía el año como 2000. En
      // SUB-JA-2026-264269 esa anotación de 2018 salía como «de hace 26,5 años»
      // y, peor, como POSIBLE CADUCADA — que es el lado barato: rebajaba de
      // 48.450,00€ a 44.850,00€ lo que se hereda (auditado el 04/08/2026).
      fecha: typeof x.fecha === 'string' && x.fecha.trim() ? x.fecha.trim().slice(0, 120) : null,
      rango: (RANGOS as string[]).includes(rango) ? (rango as RangoCarga) : 'desconocido',
      cancelada: x.cancelada === true,
      literal: typeof x.literal === 'string' && x.literal.trim() ? x.literal.trim().slice(0, 600) : null,
      documento: documento ?? null,
    }
  })

  // La fórmula con la que CIERRA la certificación no es un asiento: sacarla de
  // la lista de cargas (y quedarse con lo que de verdad dice, que es que no hay
  // más). Ver `esFormulaDeCierre` para el porqué.
  const asientos = cargas.filter((c) => !esFormulaDeCierre(c))
  const cierres = cargas.filter((c) => esFormulaDeCierre(c))

  const proc = String(o.procedimiento ?? '').toLowerCase()
  const confianza = typeof o.confianza === 'number' && o.confianza >= 0 && o.confianza <= 1 ? o.confianza : 0.5

  // Tasación pactada: solo se acepta con un año plausible (hay escrituras de los
  // 90 en el registro, pero un «año» de 3 cifras es basura del OCR).
  const vp = (o.valoracionPactada ?? {}) as Record<string, unknown>
  const anioVp = Number(vp.anio)
  const valoracionPactada: ValoracionPactada | undefined =
    NUM(vp.importe) != null || (anioVp >= 1950 && anioVp <= 2100)
      ? { importe: NUM(vp.importe), anio: anioVp >= 1950 && anioVp <= 2100 ? anioVp : null }
      : undefined

  const notas = Array.isArray(o.notas) ? o.notas.filter((n): n is string => typeof n === 'string').map((n) => n.slice(0, 400)) : []
  for (const c of cierres) {
    notas.push(
      `Fórmula de cierre de la certificación (no es un asiento): «${c.literal ?? c.acreedor ?? 'sin más cargas'}».` +
        (/afecc/i.test(c.literal ?? '') ? ' Menciona AFECCIONES FISCALES vigentes: confirmar en la Hacienda autonómica si siguen vivas (caducan a los 5 años).' : ''),
    )
  }

  return {
    cargas: asientos,
    valoracionPactada,
    procedimiento: proc === 'hipotecaria' || proc === 'embargo' ? proc : 'desconocido',
    // La fórmula de cierre ES la declaración de «sin más cargas»: si el lector
    // la metió como carga en vez de marcar el flag, se honra igual.
    sinMasCargas: o.sinMasCargas === true || cierres.length > 0,
    notas,
    fuente,
    confianza,
  }
}

/** «Sin más cargas», «no constan otras cargas», «libre de cargas»… */
const RE_CIERRE = /\bsin\s+m[aá]s\s+cargas\b|\bno\s+(?:existen|constan|hay)\s+(?:m[aá]s|otras)\s+cargas\b|\blibre\s+de\s+cargas\b|\bsin\s+otras?\s+cargas\b/i

/**
 * ¿Esta «carga» es en realidad la fórmula con la que el registro CIERRA la
 * certificación?
 *
 * Caso real (30/07/2026): «SIN MÁS CARGAS, salvo AFECCIONES FISCALES vigentes»
 * entraba en la lista como una carga `afeccion_fiscal` de rango `desconocido`.
 * Eso es doblemente falso: no es un asiento (no tiene importe, ni fecha, ni
 * titular) y, sobre todo, dice justo lo CONTRARIO de lo que se le hacía decir —
 * es la declaración de que no hay nada más. Como carga de rango desconocido se
 * contaba «por prudencia» como subsistente y ensuciaba los avisos de la ficha.
 *
 * Se exige que NO traiga importe ni fecha: una afección fiscal de verdad, con
 * su cuantía y su asiento, sigue siendo una carga aunque el literal mencione la
 * fórmula. Ante la duda, se conserva como carga (el lado caro).
 */
export function esFormulaDeCierre(c: Carga): boolean {
  if (c.importe != null || c.fecha != null) return false
  return RE_CIERRE.test(c.literal ?? '') || RE_CIERRE.test(c.acreedor ?? '')
}

/**
 * QUÉ HEREDA EL ADJUDICATARIO. Determinista, porque de esto sale la puja máxima.
 *
 * Reglas (LEC):
 *  · Ejecución HIPOTECARIA directa: la hipoteca que se ejecuta se cancela y las
 *    cargas POSTERIORES se purgan (art. 674). Solo subsisten las ANTERIORES a
 *    esa hipoteca — que son raras, pero existen (servidumbres, censos, una 1ª
 *    hipoteca cuando se ejecuta la 2ª).
 *  · Ejecución por EMBARGO (ordinaria o títulos judiciales): se purgan las
 *    posteriores a la anotación que ejecuta, y subsiste TODO lo anterior,
 *    incluidas las hipotecas. Este es el caso peligroso.
 *  · Procedimiento DESCONOCIDO: no se afirma nada. Se devuelve `importe: null`
 *    con aviso, nunca un 0 tranquilizador — un 0 se leería como «sin cargas».
 *  · Las canceladas/caducadas no cuentan nunca.
 *  · Las afecciones fiscales no se suman (suelen ir sin importe y caducan a los
 *    5 años), pero se avisa de que existen.
 *  · Las anotaciones de embargo pasadas de plazo (art. 86 LH) se MARCAN como
 *    posibles caducadas y se cuantifica el escenario alternativo, pero siguen
 *    dentro de `importe`: ver `caducidad.ts` para el porqué.
 *
 * @param hoy fecha de referencia para la caducidad. Se pasa desde fuera para que
 *            la función siga siendo determinista; sin ella no se evalúa.
 */
export function cargasQueSubsisten(cuadro: CuadroCargas, hoy?: Date): CargasSubsistentes {
  const vivas = cuadro.cargas.filter((c) => !c.cancelada)
  const avisos: string[] = []

  if (cuadro.procedimiento === 'desconocido') {
    return {
      importe: null,
      cargas: vivas.filter((c) => c.rango === 'anterior'),
      purgadas: [],
      posiblesCaducadas: [],
      importeSiCaducan: null,
      avisos: ['No se ha podido determinar si la subasta va por ejecución hipotecaria o por embargo: sin eso NO se puede saber qué cargas se purgan. Verificar en el edicto antes de pujar.'],
    }
  }

  const subsisten: Carga[] = []
  const purgadas: Carga[] = []

  for (const c of vivas) {
    if (c.tipo === 'afeccion_fiscal') {
      avisos.push('Hay afecciones fiscales vigentes: confirmar en Hacienda autonómica si siguen vivas (caducan a los 5 años).')
      continue
    }
    if (c.rango === 'la_que_ejecuta') {
      purgadas.push(c)
      continue
    }
    if (c.rango === 'posterior') {
      purgadas.push(c)
      continue
    }
    if (c.rango === 'anterior') {
      subsisten.push(c)
      continue
    }
    // Rango desconocido: se trata como subsistente (prudente) y se avisa.
    subsisten.push(c)
    avisos.push(`Carga de rango indeterminado (${c.tipo}${c.acreedor ? ` de ${c.acreedor}` : ''}): se cuenta como subsistente por prudencia. Confirmar el orden de inscripción.`)
  }

  const conImporte = subsisten.filter((c) => c.importe != null)
  let importe = subsisten.length === 0
    ? 0
    : conImporte.length === subsisten.length
      ? conImporte.reduce((s, c) => s + (c.importe ?? 0), 0)
      : null

  if (importe == null && subsisten.length) {
    avisos.push('Hay cargas que subsisten sin importe legible: el coste real está incompleto.')
  }

  // 🚨 «Se adquiere libre» hay que GANÁRSELO (30/07/2026). Un 0 aquí es la
  // afirmación más fuerte que hace este módulo, y la validación en producción
  // demostró que se puede llegar a él por accidente: el lector solo cazó UNA
  // carga de las cuatro de Belmonte, la etiquetó mal como «la que ejecuta» —
  // así que se purgó— y el resultado fue «no subsiste ninguna carga» sobre una
  // finca que arrastra 44.850€. Cero cargas subsistentes solo significa «libre»
  // si el registro CIERRA con la fórmula «sin más cargas» y la lectura tenía
  // confianza. Si no, es «no lo sé», que es `null`.
  if (importe === 0 && subsisten.length === 0 && (!cuadro.sinMasCargas || cuadro.confianza < CONFIANZA_MINIMA_LIBRE)) {
    importe = null
    avisos.push(
      'No se ha identificado ninguna carga subsistente, pero la lectura no da para afirmar que la finca esté libre' +
        (cuadro.confianza < CONFIANZA_MINIMA_LIBRE ? ` (confianza de lectura ${Math.round(cuadro.confianza * 100)}%)` : '') +
        ': trátala como «cargas sin determinar» y pide la certificación o una nota simple antes de pujar.',
    )
  }

  // El patrón que arruina la operación: hipoteca anterior en una subasta por embargo.
  const hipotecasAnteriores = subsisten.filter((c) => c.tipo === 'hipoteca')
  if (cuadro.procedimiento === 'embargo' && hipotecasAnteriores.length) {
    const suma = hipotecasAnteriores.reduce((s, c) => s + (c.importe ?? 0), 0)
    avisos.push(
      `🚨 Se subasta por ANOTACIÓN DE EMBARGO y la finca arrastra ${hipotecasAnteriores.length === 1 ? 'una hipoteca ANTERIOR' : `${hipotecasAnteriores.length} hipotecas ANTERIORES`}` +
        `${suma > 0 ? ` (${suma.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€ de responsabilidad)` : ''}: ` +
        'en esta vía NO se purga, la hereda quien se adjudique. Si el ejecutante es el propio acreedor hipotecario, PUEDE cancelarse al cobrar, pero no es automático — hay que preguntarlo al juzgado antes de pujar.',
    )
  }

  // …y el matiz que decide si ese patrón es una ruina o un trámite. Va justo
  // detrás del aviso anterior a propósito: lo que responde es su pregunta.
  const vinculo = vinculoConCargaAnterior(cuadro.cargas)
  if (vinculo && subsisten.includes(vinculo.carga)) {
    const quien = `${vinculo.carga.tipo} anterior${vinculo.carga.acreedor ? ` de ${vinculo.carga.acreedor}` : ''}` +
      `${vinculo.carga.importe != null ? ` (${formatearEur(vinculo.carga.importe)})` : ''}`
    avisos.push(
      vinculo.motivo === 'nota_marginal'
        ? `🔎 El asiento que se ejecuta declara POR NOTA AL MARGEN su relación con la inscripción ${vinculo.asiento}, que es la ${quien}: ` +
          'lo que se ejecuta sería el crédito garantizado por ella, y entonces se cancelaría al cobrar en vez de heredarse. ' +
          'Lo afirma el registro, no una deducción nuestra — pero NO es automático: confírmalo con el juzgado antes de pujar. Hasta entonces, cuenta con la cifra alta.'
        : `🔎 El acreedor del asiento que se ejecuta coincide con el de la ${quien}: ` +
          'puede que se esté ejecutando el crédito garantizado por esa carga, en cuyo caso se cancelaría al cobrar. Confírmalo con el juzgado antes de pujar.',
    )
  }

  if (!cuadro.sinMasCargas) {
    avisos.push('La certificación no cierra con la fórmula «sin más cargas»: puede faltar información registral.')
  }

  // ── Caducidad de las anotaciones (art. 86 LH) ─────────────────────────────
  // Se marca, se cuantifica aparte y se avisa; NUNCA se descuenta de `importe`.
  let posiblesCaducadas: Carga[] = []
  let importeSiCaducan: number | null = null
  if (hoy) {
    const cad = caducidadDelCuadro(subsisten, hoy)
    posiblesCaducadas = cad.posiblesCaducadas
    avisos.push(...cad.notas)
    if (posiblesCaducadas.length && importe != null && !cad.ahorroIncompleto) {
      importeSiCaducan = Math.round((importe - cad.ahorroPotencial) * 100) / 100
      avisos.push(
        `Si se confirmara la caducidad de ${posiblesCaducadas.length === 1 ? 'esa anotación' : `esas ${posiblesCaducadas.length} anotaciones`}, ` +
          `lo que se hereda bajaría de ${formatearEur(importe)} a ${formatearEur(importeSiCaducan)}. ` +
          'Cuenta con la cifra alta hasta tener una nota simple actualizada.',
      )
    }
  }

  return { importe, cargas: subsisten, purgadas, posiblesCaducadas, importeSiCaducan, avisos }
}

function formatearEur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

/**
 * ¿El ejecutante es también el acreedor de una carga ANTERIOR que subsiste? Es
 * el matiz que decide si el caso «hipoteca anterior en embargo» es una ruina o
 * solo un trámite: cuando coinciden, el crédito que se ejecuta suele ser el
 * garantizado por esa hipoteca, y se cancela al satisfacerse.
 *
 * Mira SOLO las cargas anteriores no canceladas: la carga `la_que_ejecuta` lleva
 * por definición el nombre del ejecutante, y compararla daría siempre `true`.
 *
 * Comparación laxa a propósito, pero conservadora: el registro escribe «CAJA DE
 * AHORROS DE ASTURIAS» donde el juzgado pone «LIBERBANK S.A.» tras la absorción,
 * así que en el caso real de Belmonte devuelve `false` — que es lo correcto: no
 * se puede AFIRMAR que sean el mismo acreedor, hay que preguntarlo al juzgado.
 */
/**
 * La nota marginal que ata el asiento ejecutado a una carga ANTERIOR.
 *
 * El caso real (SUB-JA-2026-264269, Belmonte, 04/08/2026). La finca arrastra una
 * hipoteca «anterior» de 44.850,00€ a favor de CAJA DE AHORROS DE ASTURIAS y se
 * subasta por la anotación letra D de LIBERBANK: 48.450,00€ heredados sobre una
 * salida de 19.329,00€, o sea descartada. Pero el literal de esa anotación
 * termina diciendo:
 *
 *   «Se hace constar por nota al margen, su relación con la inscripción de
 *    hipoteca 2ª, en trámites del procedimiento de ejecución ordinario.»
 *
 * …y la inscripción 2ª ES esa hipoteca. El registro está diciendo que el crédito
 * que se ejecuta es el garantizado por ella — con lo que se cancelaría al cobrar
 * y no se hereda casi nada. El dato estaba guardado y no lo leía nadie.
 *
 * Por qué no bastaba `mismoAcreedorQueEjecutante`: compara los acreedores contra
 * la AUTORIDAD (el juzgado), donde el ejecutante no aparece; y aunque se le
 * pasara, «CAJA DE AHORROS DE ASTURIAS» y «LIBERBANK S.A.» no casan por texto
 * (son la misma entidad tras la absorción, pero afirmarlo sería adivinar). La
 * nota marginal no adivina nada: es el registro quien afirma el vínculo.
 *
 * Nunca descuenta del importe — igual que la caducidad, marca y manda preguntar.
 */
export type VinculoEjecutante = {
  /** La carga anterior con la que el asiento ejecutado declara relación. */
  carga: Carga
  /** Asiento citado por la nota marginal («2ª»), si el vínculo viene de ahí. */
  asiento: string | null
  /** De dónde sale la afirmación. La nota marginal es del registro; el acreedor, nuestro. */
  motivo: 'nota_marginal' | 'mismo_acreedor'
}

/** «…nota al margen, su relación con la inscripción de hipoteca 2ª…» → `{tipo:'inscripcion', numero:'2'}`. */
function asientoDeNotaMarginal(literal: string | null | undefined): { tipo: string; numero: string } | null {
  const t = norm(literal ?? '')
  if (!t) return null
  const m = /nota\s+al\s+margen[^.]{0,150}?relacion\s+con\s+(?:la|el)\s+(inscripcion|anotacion)(?:\s+de\s+[a-z]+)?\s+(\d{1,3})/.exec(t)
  return m ? { tipo: m[1], numero: m[2] } : null
}

export function vinculoConCargaAnterior(cargas: Carga[]): VinculoEjecutante | null {
  const ejecuta = cargas.find((c) => c.rango === 'la_que_ejecuta' && !c.cancelada)
  if (!ejecuta) return null
  const anteriores = cargas.filter((c) => c.rango === 'anterior' && !c.cancelada)
  if (!anteriores.length) return null

  const asiento = asientoDeNotaMarginal(ejecuta.literal)
  if (asiento) {
    // El asiento se cita en el literal de la carga anterior («Inscripción 2ª de
    // fecha…»). Se exige el MISMO tipo de asiento: la inscripción 2 y la
    // anotación 2 son cosas distintas.
    const cita = new RegExp(`\\b${asiento.tipo}\\s+${asiento.numero}\\b`)
    const carga = anteriores.find((c) => cita.test(norm(c.literal ?? '')))
    if (carga) return { carga, asiento: `${asiento.numero}ª`, motivo: 'nota_marginal' }
  }

  // Sin nota marginal, queda el nombre del acreedor de la carga que ejecuta —
  // que es donde consta el ejecutante, no en la autoridad.
  const porAcreedor = anteriores.find((c) => mismoAcreedorQueEjecutante([c], ejecuta.acreedor))
  return porAcreedor ? { carga: porAcreedor, asiento: null, motivo: 'mismo_acreedor' } : null
}

export function mismoAcreedorQueEjecutante(cargas: Carga[], ejecutante: string | null | undefined): boolean {
  const e = (ejecutante ?? '').toLowerCase().replace(/[^a-záéíóúñ0-9 ]/g, ' ').replace(/\b(s\s?a|s\s?l|sau|slu|banco|caja|de|la|el|los|las|y)\b/g, ' ').trim()
  if (e.length < 4) return false
  const tokens = e.split(/\s+/).filter((t) => t.length >= 4)
  if (!tokens.length) return false
  return cargas
    .filter((c) => c.rango === 'anterior' && !c.cancelada)
    .some((c) => {
      const a = (c.acreedor ?? '').toLowerCase()
      return tokens.some((t) => a.includes(t))
    })
}

/**
 * Letra con la que el registro identifica una anotación preventiva («anotación
 * letra C»). Es el identificador REGISTRAL del asiento: no cambia de un
 * documento a otro, a diferencia del importe, que cada documento cita por una
 * parte distinta (principal, o principal + intereses y costas).
 */
export function letraAnotacion(c: Carga): string | null {
  const m = /\bletra\s+([a-zñ])\b/i.exec(c.literal ?? '')
  return m ? m[1].toUpperCase() : null
}

const normAcreedor = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)

/**
 * Identidad del ASIENTO, para reconocer la misma carga leída en documentos
 * distintos. Por orden de fiabilidad: la letra de la anotación, la fecha con el
 * titular y, si no hay nada de eso, la firma antigua (tipo+rango+importe).
 */
export function identidadCarga(c: Carga): string {
  const letra = letraAnotacion(c)
  if (letra) return `${c.tipo}|letra:${letra}`
  if (c.fecha) return `${c.tipo}|fecha:${c.fecha.toLowerCase()}|${normAcreedor(c.acreedor)}`
  if (c.acreedor) return `${c.tipo}|acreedor:${normAcreedor(c.acreedor)}`
  return `${c.tipo}|${c.rango}|${c.importe ?? '?'}`
}

/** El rango que MÁS cuesta de los dos: subsistir es más caro que purgarse. */
function rangoConservador(a: RangoCarga, b: RangoCarga): RangoCarga {
  const orden: RangoCarga[] = ['anterior', 'desconocido', 'posterior', 'la_que_ejecuta']
  return orden[Math.min(orden.indexOf(a), orden.indexOf(b))]
}

/**
 * Cuánto vale la palabra de un documento cuando dos se contradicen en el RANGO.
 *
 * 2 = **certificación de dominio y cargas**. Es el documento que el registrador
 *     expide PARA esta ejecución y el único que numera los asientos: el rango
 *     sale de ahí y de ningún otro sitio.
 * 1 = **nota simple**. Describe la finca, pero suele citar las cargas por la
 *     fecha de la ESCRITURA y sin el número de inscripción.
 * 0 = edicto, informe de valoración, escritura de cesión…
 */
export function autoridadDocumental(titulo: string | null | undefined): 0 | 1 | 2 {
  const t = norm(titulo ?? '')
  if (!t) return 0
  if (/certific\w*/.test(t) && /(dominio|carga|registral)/.test(t)) return 2
  if (/\bnota\s+simple\b/.test(t)) return 1
  return 0
}

/** Las fechas que cita un asiento, en ISO. Una carga tiene varias a propósito:
 *  la de INSCRIPCIÓN y la de la ESCRITURA que la causó son distintas. */
function fechasDeAsiento(c: Carga): Set<string> {
  const texto = `${c.fecha ?? ''} ${c.literal ?? ''}`
  const out = new Set<string>()
  const iso = (a: number, m: number, d: number) =>
    a >= 1900 && a <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31
      ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : null

  for (const m of texto.matchAll(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/g)) {
    const f = iso(+m[3], +m[2], +m[1])
    if (f) out.add(f)
  }
  for (const m of texto.matchAll(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\b/gi)) {
    const mes = MESES_ES.indexOf(norm(m[2]))
    if (mes < 0) continue
    const f = iso(+m[3], mes + 1, +m[1])
    if (f) out.add(f)
  }

  // Fechas EN LETRA: «diecisiete de agosto de dos mil nueve».
  //
  // Así las escriben las certificaciones registrales, mientras que un informe
  // de valoración de la misma finca pone «17 de agosto de 2009». Si solo se
  // entiende una de las dos formas, las dos lecturas del MISMO asiento no
  // comparten ninguna fecha y `mismoAsiento` las da por distintas: la hipoteca
  // se cuenta dos veces. Caso real (SUB-JA-2026-264269, Belmonte): 44.850,00€
  // duplicados llevaron lo heredado a 93.300,00€ en vez de 48.450,00€.
  const RE_LETRA = new RegExp(
    String.raw`((?:[a-z]+\s+){0,3}[a-z]+)\s+de\s+(${MESES_ES.join('|')})\s+de\s+((?:[a-z]+\s+){0,3}[a-z]+)`,
    'g',
  )
  for (const m of norm(texto).matchAll(RE_LETRA)) {
    // El día es la cola del prefijo («anotación de fecha diecisiete»), el año
    // la cabeza del sufijo («dos mil nueve, expedida por…»).
    const dia = numeroAlFinal(m[1])
    const anio = palabrasANumero(m[3])
    if (dia == null || anio == null) continue
    const f = iso(anio, MESES_ES.indexOf(m[2]) + 1, dia)
    if (f) out.add(f)
  }
  return out
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * El PRINCIPAL que garantiza la carga. Es la cifra que NO cambia de un documento
 * a otro: la certificación añade intereses y costas para dar la responsabilidad
 * total, pero el principal es el mismo. Sirve de contraste al emparejar.
 */
function principalDe(c: Carga): number | null {
  const t = c.literal ?? ''
  const etiquetado = /\bprincipal(?:\s+de)?\s*:?\s*([\d][\d.,]*)/i.exec(t)
  if (etiquetado) return parseImporteEs(etiquetado[1])
  const entreParentesis = /responder\s+de\s+[^()]*\(\s*([\d][\d.,]*)\s*€/i.exec(t)
  if (entreParentesis) return parseImporteEs(entreParentesis[1])
  return null
}

/**
 * ¿Son estas dos lecturas EL MISMO asiento registral?
 *
 * 🚨 El caso que lo motiva (SUB-JA-2026-264600, Punta Umbría, auditado el
 * 04/08/2026): la certificación citaba las hipotecas por su fecha de
 * INSCRIPCIÓN (10/02/2009, 29/04/2011) y la nota simple las mismas dos por la
 * fecha de la ESCRITURA (30/12/2008, 24/03/2011), con el acreedor escrito
 * distinto («CAIXA D'ESTALVIS CATALUNYA» / «CAIXA D'ESTALVIS DE CATALUNYA, HOY
 * BBVA»). `identidadCarga` no las emparejaba, así que la finca acababa con
 * CUATRO hipotecas donde hay dos — y encima con los rangos cruzados: las dos
 * copias de la nota simple venían como «anterior» y se sumaban 43.200,00€ de
 * cargas heredadas en una ejecución hipotecaria donde la propia certificación
 * dice que son POSTERIORES y se purgan.
 *
 * El puente es la fecha: la certificación cita las DOS (inscripción y «Fecha
 * documento»), así que basta con que compartan una. El principal se usa de
 * contraste — si ambos lo declaran y no coinciden, son asientos distintos.
 */
function mismoAsiento(a: Carga, b: Carga): boolean {
  if (a.tipo !== b.tipo) return false

  // La letra de la anotación es el identificador registral: si ambas la traen,
  // decide sin apelación en los dos sentidos.
  const la = letraAnotacion(a)
  const lb = letraAnotacion(b)
  if (la && lb) return la === lb

  if (identidadCarga(a) === identidadCarga(b)) return true

  const fa = fechasDeAsiento(a)
  if (![...fechasDeAsiento(b)].some((f) => fa.has(f))) return false

  const pa = principalDe(a)
  const pb = principalDe(b)
  if (pa != null && pb != null && Math.abs(pa - pb) > Math.max(pa, pb) * 0.01) return false
  return true
}

/**
 * Fusiona las cargas leídas en VARIOS documentos de la misma finca (edicto,
 * certificación, informe de valoración…) dejando UNA fila por asiento.
 *
 * 🚨 El caso que la motiva (30/07/2026): la certificación citaba el embargo
 * letra C) por 3.600€ (responsabilidad total) y el informe de valoración por
 * 2.600€ (solo el principal). Al deduplicar por tipo+rango+IMPORTE —que es
 * justo lo que cambia— sobrevivían las dos filas y el mismo embargo se contaba
 * DOS VECES: 51.050€ de cargas heredadas donde había 48.450€. Un coste inflado
 * descarta subastas que sí eran negocio, igual que uno rebajado hace pujar de
 * más.
 *
 * Al fusionar se queda con el importe MAYOR (lo que puede reclamar el acreedor)
 * y con el rango más caro, y avisa de la discrepancia: nunca promedia ni elige
 * en silencio.
 */
export function fusionarCargas(cargas: Carga[]): { cargas: Carga[]; avisos: string[] } {
  const avisos: string[] = []
  const grupos: Carga[] = []

  for (const c of cargas) {
    const i = grupos.findIndex((g) => mismoAsiento(g, c))
    if (i < 0) {
      grupos.push(c)
      continue
    }
    const previa = grupos[i]

    if (previa.importe != null && c.importe != null && Math.abs(previa.importe - c.importe) > Math.max(previa.importe, c.importe) * 0.01) {
      avisos.push(
        `${describir(c)} aparece en dos documentos con importes distintos (${formatearEur(previa.importe)} y ${formatearEur(c.importe)}): ` +
          'se cuenta el MAYOR, que suele ser la responsabilidad total (principal + intereses + costas) frente al principal a secas. Confirmar en la certificación.',
      )
    }

    grupos[i] = {
      ...previa,
      importe: previa.importe == null ? c.importe : c.importe == null ? previa.importe : Math.max(previa.importe, c.importe),
      rango: arbitrarRango(previa, c, avisos),
      // Cancelada solo si TODOS los documentos lo dicen: uno que no lo mencione
      // no basta para dar por cancelada una carga.
      cancelada: previa.cancelada && c.cancelada,
      acreedor: previa.acreedor ?? c.acreedor,
      fecha: previa.fecha ?? c.fecha,
      literal: previa.literal ?? c.literal,
      // Se conserva el documento de MÁS autoridad: es el que explica el rango.
      documento: autoridadDocumental(c.documento) > autoridadDocumental(previa.documento) ? c.documento : previa.documento,
    }
  }

  return { cargas: grupos, avisos }
}

/**
 * Rango cuando dos documentos discrepan.
 *
 * Antes se cogía siempre el MÁS CARO, que es lo correcto cuando ninguno de los
 * dos sabe más que el otro. Pero no es el caso: el orden de los asientos lo
 * establece la CERTIFICACIÓN, que los numera; una nota simple los cita sueltos y
 * el modelo tiene que adivinar el rango. Coger «el más caro» convertía en
 * heredadas dos hipotecas que la certificación declara posteriores y purgadas
 * (Punta Umbría, 43.200,00€ de coste inventado).
 *
 * Cuando la autoridad empata se vuelve a lo conservador: sin árbitro, caro.
 */
function arbitrarRango(a: Carga, b: Carga, avisos: string[]): RangoCarga {
  if (a.rango === b.rango) return a.rango

  const aa = autoridadDocumental(a.documento)
  const ab = autoridadDocumental(b.documento)
  if (aa === ab) {
    avisos.push(`${describir(b)} consta con rango distinto según el documento (${a.rango} y ${b.rango}): se cuenta el más caro.`)
    return rangoConservador(a.rango, b.rango)
  }

  const manda = aa > ab ? a : b
  const otro = aa > ab ? b : a
  avisos.push(
    `${describir(b)} consta como ${otro.rango} en «${otro.documento ?? 'otro documento'}» y como ${manda.rango} en ` +
      `«${manda.documento ?? 'la certificación'}»: manda este último, que es el que numera los asientos y fija el orden registral. ` +
      'Compruébalo en la certificación antes de pujar.',
  )
  return manda.rango
}

function describir(c: Carga): string {
  const letra = letraAnotacion(c)
  if (letra) return `La anotación letra ${letra}`
  return `La carga ${c.tipo.replace(/_/g, ' ')}${c.acreedor ? ` de ${c.acreedor}` : ''}`
}

/**
 * Empareja las cargas de dos lecturas del MISMO documento. Primero por identidad
 * registral (la letra de la anotación, la fecha…) y solo después, entre las que
 * quedan sueltas, por tipo+rango — que es lo único que había antes y confundía
 * dos embargos anteriores entre sí.
 */
function emparejarLecturas(a: Carga[], b: Carga[]): Map<Carga, Carga> {
  const pares = new Map<Carga, Carga>()
  const libres = new Set(b)

  for (const ca of a) {
    const cb = [...libres].find((x) => identidadCarga(x) === identidadCarga(ca))
    if (cb) {
      pares.set(ca, cb)
      libres.delete(cb)
    }
  }
  for (const ca of a) {
    if (pares.has(ca)) continue
    const cb = [...libres].find((x) => x.tipo === ca.tipo && x.rango === ca.rango)
    if (cb) {
      pares.set(ca, cb)
      libres.delete(cb)
    }
  }
  return pares
}

/**
 * Consenso entre DOS lecturas independientes del mismo documento. Alberto pidió
 * que la IA extraiga las cifras; esta es la red que evita que un dígito mal
 * leído se propague a una puja. Se emparejan las cargas por tipo+rango y se
 * conserva el importe SOLO si ambas lecturas coinciden (tolerancia del 1% para
 * el redondeo del OCR); si discrepan, el importe se anula y se avisa.
 */
export function consensoCuadros(a: CuadroCargas, b: CuadroCargas): { cuadro: CuadroCargas; discrepancias: string[] } {
  const discrepancias: string[] = []
  const pares = emparejarLecturas(a.cargas, b.cargas)

  const cargas: Carga[] = a.cargas.map((ca) => {
    const cb = pares.get(ca)
    if (!cb) {
      discrepancias.push(`La segunda lectura no vio la carga ${ca.tipo} (${ca.rango}).`)
      return { ...ca, importe: null }
    }
    if (ca.importe != null && cb.importe != null) {
      const dif = Math.abs(ca.importe - cb.importe)
      const tolerancia = Math.max(ca.importe, cb.importe) * 0.01
      if (dif > tolerancia) {
        discrepancias.push(`Importe discrepante en ${ca.tipo}: ${ca.importe} vs ${cb.importe}. Se descarta la cifra.`)
        return { ...ca, importe: null }
      }
      return { ...ca, importe: Math.min(ca.importe, cb.importe) }
    }
    if (ca.importe == null && cb.importe != null) {
      discrepancias.push(`Solo la segunda lectura vio importe en ${ca.tipo} (${cb.importe}): no se da por bueno.`)
      return { ...ca, importe: null }
    }
    return ca
  })

  const emparejadas = new Set(pares.values())
  const soloEnB = b.cargas.filter((cb) => !emparejadas.has(cb))
  for (const cb of soloEnB) {
    discrepancias.push(`Solo la segunda lectura vio una carga ${cb.tipo} (${cb.rango}): se incluye sin importe.`)
    cargas.push({ ...cb, importe: null })
  }

  const procedimiento = a.procedimiento === b.procedimiento ? a.procedimiento : 'desconocido'
  if (procedimiento === 'desconocido' && a.procedimiento !== b.procedimiento) {
    discrepancias.push(`Las dos lecturas discrepan en la vía del procedimiento (${a.procedimiento} vs ${b.procedimiento}).`)
  }

  return {
    cuadro: {
      cargas,
      procedimiento,
      sinMasCargas: a.sinMasCargas && b.sinMasCargas,
      notas: [...new Set([...a.notas, ...b.notas])],
      fuente: a.fuente,
      confianza: Math.min(a.confianza, b.confianza) * (discrepancias.length ? 0.7 : 1),
    },
    discrepancias,
  }
}

export interface CambioCargas {
  tipo: 'nueva' | 'desaparecida' | 'importe' | 'cancelada'
  carga: Carga
  detalle: string
}

/**
 * Compara el cuadro que se leyó de la certificación del BOE con uno NUEVO (una
 * nota simple recién pedida al registro, por ejemplo).
 *
 * Hace falta porque la certificación que el juzgado adjunta a la ficha suele ser
 * de hace años —la de Belmonte es de agosto de 2020— y las cargas se mueven: se
 * cancelan hipotecas, caducan embargos y aparecen otros nuevos. Antes de pujar en
 * serio, una nota simple actualizada cuesta unos euros y esta función dice
 * exactamente qué ha cambiado, en vez de obligar a releer dos documentos.
 *
 * Se emparejan las cargas por tipo + acreedor normalizado, no por importe (el
 * importe es justo lo que puede haber cambiado).
 */
export function compararCuadros(anterior: CuadroCargas, nuevo: CuadroCargas): CambioCargas[] {
  const norma = (c: Carga) => `${c.tipo}|${(c.acreedor ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`
  const cambios: CambioCargas[] = []
  const eur = (n: number) =>
    `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`

  for (const n of nuevo.cargas) {
    const previa = anterior.cargas.find((a) => norma(a) === norma(n))
    if (!previa) {
      cambios.push({
        tipo: 'nueva',
        carga: n,
        detalle: `Carga NUEVA que no estaba en la certificación: ${n.tipo.replace(/_/g, ' ')}` +
          `${n.acreedor ? ` a favor de ${n.acreedor}` : ''}${n.importe != null ? ` por ${eur(n.importe)}` : ''}.`,
      })
      continue
    }
    if (n.cancelada && !previa.cancelada) {
      cambios.push({
        tipo: 'cancelada',
        carga: n,
        detalle: `Ya está CANCELADA: ${n.tipo.replace(/_/g, ' ')}${n.acreedor ? ` de ${n.acreedor}` : ''}` +
          `${previa.importe != null ? ` (eran ${eur(previa.importe)})` : ''}. Deja de contar en el coste.`,
      })
      continue
    }
    if (previa.importe != null && n.importe != null && Math.abs(previa.importe - n.importe) > Math.max(previa.importe, n.importe) * 0.01) {
      cambios.push({
        tipo: 'importe',
        carga: n,
        detalle: `Cambia el importe de ${n.tipo.replace(/_/g, ' ')}: ${eur(previa.importe)} → ${eur(n.importe)}.`,
      })
    }
  }

  for (const a of anterior.cargas.filter((c) => !c.cancelada)) {
    if (!nuevo.cargas.some((n) => norma(n) === norma(a))) {
      cambios.push({
        tipo: 'desaparecida',
        carga: a,
        detalle: `Ya no aparece: ${a.tipo.replace(/_/g, ' ')}${a.acreedor ? ` de ${a.acreedor}` : ''}` +
          `${a.importe != null ? ` (${eur(a.importe)})` : ''}. Probablemente cancelada o caducada.`,
      })
    }
  }

  return cambios
}

/** Resumen legible del cuadro para la ficha y el aviso de Telegram. */
export function resumirCargas(cuadro: CuadroCargas, subsistentes: CargasSubsistentes): string {
  const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
  const lineas: string[] = []

  const via = cuadro.procedimiento === 'hipotecaria'
    ? 'Ejecución hipotecaria directa (se purgan las posteriores).'
    : cuadro.procedimiento === 'embargo'
      ? 'Ejecución por anotación de embargo (subsisten TODAS las anteriores).'
      : 'Vía del procedimiento sin determinar.'
  lineas.push(via)

  for (const c of cuadro.cargas) {
    const partes = [c.tipo.replace(/_/g, ' ')]
    if (c.acreedor) partes.push(`a favor de ${c.acreedor}`)
    if (c.importe != null) partes.push(eur(c.importe))
    if (c.fecha) partes.push(`(${c.fecha})`)
    const estado = c.cancelada ? 'CANCELADA' : c.rango === 'la_que_ejecuta' ? 'la que se ejecuta' : c.rango
    lineas.push(`· ${partes.join(' ')} — ${estado}`)
  }

  if (subsistentes.importe != null) {
    lineas.push(subsistentes.importe > 0
      ? `Hereda el adjudicatario: ${eur(subsistentes.importe)}`
      : 'No subsiste ninguna carga: se adquiere libre.')
  } else {
    lineas.push('Cargas subsistentes sin cuantificar.')
  }

  // El escenario alternativo va SIEMPRE debajo del conservador y etiquetado como
  // hipótesis: nunca sustituye a la cifra que manda.
  if (subsistentes.posiblesCaducadas.length) {
    lineas.push(
      `⏳ ${subsistentes.posiblesCaducadas.length === 1 ? 'Una anotación de embargo podría' : `${subsistentes.posiblesCaducadas.length} anotaciones de embargo podrían`} ` +
        `estar caducada${subsistentes.posiblesCaducadas.length === 1 ? '' : 's'} (art. 86 LH)` +
        (subsistentes.importeSiCaducan != null ? `: en ese caso heredaría ${eur(subsistentes.importeSiCaducan)}` : '') +
        '. Sin confirmar.',
    )
  }

  return [...lineas, ...cuadro.notas.map((n) => `· ${n}`), ...subsistentes.avisos].join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// ¿QUÉ SABEMOS de las cargas de esta subasta? — tres estados, no dos.
//
// 🚨 Caso real (SUB-JA-2026-264478, queja de Alberto el 01/08/2026): el BOE
// publicaba la «certificación de dominio y cargas», el cron la había listado y
// hasta descargado… y la ficha decía «Cargas no publicadas: pide la
// certificación registral antes de pujar». Estaba publicada. Lo que no se había
// hecho era LEERLA (no pasó el gate de rentabilidad, ver `documentos.ts`).
//
// `cargas_conocidas = false` significa «no lo hemos leído», y eso NO es lo mismo
// que «el BOE no lo publica»: el primero se arregla abriendo un PDF que ya
// tenemos enlazado, y el segundo obliga a ir al Registro. Colapsarlos manda a
// Alberto al sitio equivocado — exactamente la regla del `CLAUDE.md` sobre el
// NULL de enriquecimiento, aplicada al dato del que depende la puja.
// ────────────────────────────────────────────────────────────────────────────

/**
 * ¿El título de un adjunto de la ficha promete el cuadro de cargas?
 *
 * Los juzgados titulan a mano y con erratas: en el corpus vivo conviven
 * «CERTIFICACIÓN DE CARGAS», «CERTIFICCION DE DOMINOS Y CARGAS», «CERTIFICADO
 * DOMINIO Y CARGAS FINCA 27488 Y 27490» y «CESIÓN DEL CRÉDITO Y NOTA SIMPLE».
 * Por eso se busca la PALABRA CLAVE («carga», «nota simple», «dominio» junto a
 * certificación) y no un título canónico que no existe.
 */
export function esDocumentoDeCargas(titulo: string | null | undefined): boolean {
  const t = norm(titulo ?? '')
  if (!t) return false
  return (
    /\bcargas?\b/.test(t) ||
    /\bnota\s+simple\b/.test(t) ||
    /\bcertific\w*\s+(de\s+|del\s+)?(dominio|registral)/.test(t)
  )
}

/**
 * Lo que se puede AFIRMAR sobre las cargas:
 *  · `subsisten`              — leídas y cuantificadas: hay cargas que se suman al precio.
 *  · `sin_cargas`             — leídas y cuantificadas: no subsiste ninguna (un 0 leído vale).
 *  · `sin_cuantificar`        — consta que hay cargas, pero nadie ha determinado el importe.
 *  · `publicadas_sin_extraer` — la ficha publica el documento y no tenemos su cuadro de cargas.
 *  · `ocultas_tras_login`     — el Portal no enseña la lista de documentos sin iniciar sesión.
 *  · `ocultas_pese_a_sesion`  — el lector YA entró identificado y el Portal las sigue sin publicar.
 *  · `no_publicadas`          — ficha revisada Y visible entera: no hay documento de cargas que abrir.
 *  · `sin_revisar`            — ni siquiera se ha mirado la ficha todavía.
 */
export type EstadoCargas =
  | 'subsisten'
  | 'sin_cargas'
  | 'sin_cuantificar'
  | 'publicadas_sin_extraer'
  | 'ocultas_tras_login'
  | 'ocultas_pese_a_sesion'
  | 'no_publicadas'
  | 'sin_revisar'

/** Adjunto de la ficha, en lo mínimo que necesita esta decisión. */
export interface AdjuntoFicha {
  titulo?: string | null
  url?: string | null
  legible?: boolean | null
}

export interface EntradaEstadoCargas {
  cargas?: number | null
  cargasConocidas?: boolean | null
  /** `null`/`undefined` = la ficha AÚN no se ha revisado. `[]` = revisada, sin adjuntos. */
  documentos?: AdjuntoFicha[] | null
  /** `false` para las fuentes sin ficha documental (los lotes de la Junta). */
  publicaAdjuntos?: boolean
  /**
   * Lo que el Portal deja ver sin iniciar sesión (`muroDocumental`). Con muro,
   * una lista corta o vacía NO autoriza a decir que el BOE no publica nada:
   * lo único cierto es que a nosotros no nos lo enseña.
   */
  muro?: MuroDocumental | null
  /**
   * ¿La última lectura de la ficha se hizo CON sesión en el Portal?
   * `true` = sí · `false` = en anónimo · `null`/`undefined` = no consta
   * (fichas leídas antes de que el cron supiera identificarse).
   *
   * Solo cambia el recado cuando hay muro, y ahí lo cambia entero: «inicia
   * sesión» frente a «pide la certificación al Registro».
   */
  sesion?: boolean | null
}

/**
 * Estado de las cargas + el documento que hay que abrir, si lo hay.
 *
 * Conservador por diseño: `cargas > 0` manda sobre todo lo demás (si alguna vez
 * hubo una lectura con cargas, no se degrada a «no se sabe» porque otra pasada
 * dejara el flag atrás), y la ausencia de cargas solo se afirma con
 * `cargasConocidas === true` — un `null` nunca se lee como «finca limpia».
 */
export function estadoCargas(e: EntradaEstadoCargas): {
  estado: EstadoCargas
  documento: AdjuntoFicha | null
} {
  const docs = e.documentos ?? null
  const documento = docs?.find((d) => esDocumentoDeCargas(d.titulo)) ?? null

  if ((e.cargas ?? 0) > 0) return { estado: 'subsisten', documento }

  // 🚨 «Conocidas» ≠ «cuantificadas». `cargas_conocidas` se pone a true en cuanto
  // ALGO habla de cargas —el campo Cargas de la ficha del BOE trae texto, o una
  // lectura devolvió cuadro—, pero el IMPORTE que subsiste puede seguir sin
  // determinarse (`cargasQueSubsisten` devuelve `importe: null` cuando no se
  // puede afirmar). Sin importe no se puede decir «finca limpia»: el 🟢 exige
  // que la cifra EXISTA, aunque sea 0. Auditado el 01/08/2026 sobre el corpus
  // vivo: 3 de las 14 subastas del BOE estaban en este hueco y pintaban 🟢 «Sin
  // cargas anteriores subsistentes» sin que nadie hubiera cuantificado nada.
  if (e.cargasConocidas === true) {
    return { estado: e.cargas == null ? 'sin_cuantificar' : 'sin_cargas', documento }
  }

  // No se sabe. Lo útil es decir POR QUÉ, porque cada porqué manda a un sitio
  // distinto: abrir el PDF que ya tenemos, esperar al cron, o ir al Registro.
  if (documento) return { estado: 'publicadas_sin_extraer', documento }
  // 🚨 Antes de negar la publicación, ¿nos la han dejado ver? Con el muro del
  // Portal la lista que tenemos está capada (o vacía del todo), y decir «no
  // publicadas» manda a Alberto al Registro a pagar por una certificación que
  // está a un login de distancia. Va ANTES que el `docs == null` porque el muro
  // es una respuesta más precisa que «pendiente de revisar».
  if (e.muro === 'total' || e.muro === 'parcial') {
    // Y con QUÉ ojos se miró: si la lectura ya iba identificada, «inicia sesión»
    // es un recado imposible de cumplir y esconde la verdad —que ahí no hay nada
    // que abrir y toca pedir la certificación al Registro—. Mandar a alguien a
    // hacer lo que ya está hecho es la forma educada de no decir nada.
    return { estado: e.sesion === true ? 'ocultas_pese_a_sesion' : 'ocultas_tras_login', documento: null }
  }
  if (docs == null) {
    return { estado: e.publicaAdjuntos === false ? 'no_publicadas' : 'sin_revisar', documento: null }
  }
  return { estado: 'no_publicadas', documento: null }
}

/**
 * Titular de CARGAS para la ficha: emoji, frase y —si lo hay— el documento que
 * Alberto tiene que abrir. Vive aquí (módulo puro y testeado) y no incrustado en
 * el JSX porque es la frase sobre la que se decide si se puja: si miente, se
 * puja a ciegas.
 *
 * `importe` solo viene informado en `subsisten`; quien pinta le da el formato de
 * euros de su app (aquí no se decide la presentación del dinero).
 */
export interface TitularCargas {
  estado: EstadoCargas
  emoji: '🔴' | '🟠' | '🟢'
  texto: string
  /** El PDF que resuelve la duda, cuando la ficha lo publica. */
  documento: AdjuntoFicha | null
  importe: number | null
}

export function titularCargas(e: EntradaEstadoCargas): TitularCargas {
  const { estado, documento } = estadoCargas(e)
  const base = { estado, documento, importe: null as number | null }

  switch (estado) {
    case 'subsisten':
      return { ...base, emoji: '🔴', texto: 'Cargas anteriores que SUBSISTEN y se suman al precio:', importe: e.cargas ?? null }
    case 'sin_cargas':
      return { ...base, emoji: '🟢', texto: 'Sin cargas anteriores subsistentes: leído y cuantificado.' }
    case 'sin_cuantificar':
      return {
        ...base,
        emoji: '🟠',
        texto: documento
          ? `Constan cargas pero SIN cuantificar: abre «${(documento.titulo ?? 'la certificación').trim()}» y súmalas al precio antes de pujar.`
          : 'Constan cargas pero SIN cuantificar: pide la certificación registral y súmalas al precio antes de pujar.',
      }
    // Deliberadamente NO afirma «no se ha analizado»: cubre tanto la ficha que
    // aún no ha pasado por el lector como la que pasó y no soltó cuadro (escaneo
    // ilegible, lectura vacía). Lo único cierto en los dos casos —y lo único que
    // Alberto necesita— es que el cuadro no lo tenemos y el PDF está ahí.
    case 'publicadas_sin_extraer':
      return {
        ...base,
        emoji: '🟠',
        texto: `El BOE SÍ publica «${(documento?.titulo ?? 'certificación de cargas').trim()}» pero NO tenemos su cuadro de cargas: ábrela antes de pujar.`,
      }
    case 'ocultas_tras_login':
      return {
        ...base,
        emoji: '🟠',
        texto: 'El Portal del BOE NO enseña los documentos de esta subasta sin iniciar sesión: entra con tu usuario y ábrelos antes de pujar (no hace falta ir al Registro).',
      }
    case 'ocultas_pese_a_sesion':
      return {
        ...base,
        emoji: '🟠',
        texto: 'Ni con sesión iniciada publica el Portal los documentos de esta subasta: aquí sí hace falta pedir la certificación de cargas al Registro (o al juzgado) antes de pujar.',
      }
    case 'sin_revisar':
      return { ...base, emoji: '🟠', texto: 'Cargas sin comprobar: la ficha del BOE todavía no se ha revisado.' }
    default:
      return { ...base, emoji: '🟠', texto: 'Cargas no publicadas: pide la certificación registral antes de pujar.' }
  }
}
