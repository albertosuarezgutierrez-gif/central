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
export function normalizarCuadroCargas(bruto: unknown, fuente: FuenteCargas): CuadroCargas {
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
      fecha: typeof x.fecha === 'string' && x.fecha.trim() ? x.fecha.trim().slice(0, 40) : null,
      rango: (RANGOS as string[]).includes(rango) ? (rango as RangoCarga) : 'desconocido',
      cancelada: x.cancelada === true,
      literal: typeof x.literal === 'string' && x.literal.trim() ? x.literal.trim().slice(0, 600) : null,
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
  const porIdentidad = new Map<string, Carga>()

  for (const c of cargas) {
    const k = identidadCarga(c)
    const previa = porIdentidad.get(k)
    if (!previa) {
      porIdentidad.set(k, c)
      continue
    }

    if (previa.importe != null && c.importe != null && Math.abs(previa.importe - c.importe) > Math.max(previa.importe, c.importe) * 0.01) {
      avisos.push(
        `${describir(c)} aparece en dos documentos con importes distintos (${formatearEur(previa.importe)} y ${formatearEur(c.importe)}): ` +
          'se cuenta el MAYOR, que suele ser la responsabilidad total (principal + intereses + costas) frente al principal a secas. Confirmar en la certificación.',
      )
    }
    if (previa.rango !== c.rango) {
      avisos.push(`${describir(c)} consta con rango distinto según el documento (${previa.rango} y ${c.rango}): se cuenta el más caro.`)
    }

    porIdentidad.set(k, {
      ...previa,
      importe: previa.importe == null ? c.importe : c.importe == null ? previa.importe : Math.max(previa.importe, c.importe),
      rango: rangoConservador(previa.rango, c.rango),
      // Cancelada solo si TODOS los documentos lo dicen: uno que no lo mencione
      // no basta para dar por cancelada una carga.
      cancelada: previa.cancelada && c.cancelada,
      acreedor: previa.acreedor ?? c.acreedor,
      fecha: previa.fecha ?? c.fecha,
      literal: previa.literal ?? c.literal,
    })
  }

  return { cargas: [...porIdentidad.values()], avisos }
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
