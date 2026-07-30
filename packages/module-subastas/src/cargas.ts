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

export interface CuadroCargas {
  cargas: Carga[]
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
  /** Suma de lo que el adjudicatario hereda. `null` = no se puede afirmar. */
  importe: number | null
  /** Las cargas que subsisten, para poder enseñarlas una a una. */
  cargas: Carga[]
  /** Las que se purgan con la adjudicación (informativo, tranquiliza). */
  purgadas: Carga[]
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

  const proc = String(o.procedimiento ?? '').toLowerCase()
  const confianza = typeof o.confianza === 'number' && o.confianza >= 0 && o.confianza <= 1 ? o.confianza : 0.5

  return {
    cargas,
    procedimiento: proc === 'hipotecaria' || proc === 'embargo' ? proc : 'desconocido',
    sinMasCargas: o.sinMasCargas === true,
    notas: Array.isArray(o.notas) ? o.notas.filter((n): n is string => typeof n === 'string').map((n) => n.slice(0, 400)) : [],
    fuente,
    confianza,
  }
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
 */
export function cargasQueSubsisten(cuadro: CuadroCargas): CargasSubsistentes {
  const vivas = cuadro.cargas.filter((c) => !c.cancelada)
  const avisos: string[] = []

  if (cuadro.procedimiento === 'desconocido') {
    return {
      importe: null,
      cargas: vivas.filter((c) => c.rango === 'anterior'),
      purgadas: [],
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
  const importe = subsisten.length === 0
    ? 0
    : conImporte.length === subsisten.length
      ? conImporte.reduce((s, c) => s + (c.importe ?? 0), 0)
      : null

  if (importe == null && subsisten.length) {
    avisos.push('Hay cargas que subsisten sin importe legible: el coste real está incompleto.')
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

  return { importe, cargas: subsisten, purgadas, avisos }
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
 * Consenso entre DOS lecturas independientes del mismo documento. Alberto pidió
 * que la IA extraiga las cifras; esta es la red que evita que un dígito mal
 * leído se propague a una puja. Se emparejan las cargas por tipo+rango y se
 * conserva el importe SOLO si ambas lecturas coinciden (tolerancia del 1% para
 * el redondeo del OCR); si discrepan, el importe se anula y se avisa.
 */
export function consensoCuadros(a: CuadroCargas, b: CuadroCargas): { cuadro: CuadroCargas; discrepancias: string[] } {
  const discrepancias: string[] = []
  const clave = (c: Carga) => `${c.tipo}|${c.rango}`

  const cargas: Carga[] = a.cargas.map((ca) => {
    const cb = b.cargas.find((x) => clave(x) === clave(ca))
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

  const soloEnB = b.cargas.filter((cb) => !a.cargas.some((ca) => clave(ca) === clave(cb)))
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

  return [...lineas, ...cuadro.notas.map((n) => `· ${n}`), ...subsistentes.avisos].join('\n')
}
