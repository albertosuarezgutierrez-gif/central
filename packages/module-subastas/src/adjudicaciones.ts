// ────────────────────────────────────────────────────────────────────────────
// Calibración del scoring con RESULTADOS reales de subastas concluidas. PURO.
//
// El BOE publica el resultado de cada subasta (adjudicada/desierta y el importe
// de adjudicación); `capturarResultados` lo guarda. Con muestra suficiente, la
// mediana de `importe_adjudicacion / valor_subasta` por provincia dice a qué %
// del tipo se adjudica DE VERDAD — realidad contra la teoría del scoring.
// Sin muestra, no se dice nada (nunca se inventa).
// ────────────────────────────────────────────────────────────────────────────

/** Fila de una subasta concluida, tal cual sale de la BD. */
export interface ResultadoConcluido {
  provincia: string | null
  valorSubasta: number | null
  importeAdjudicacion: number | null
  /** Resultado capturado («adjudicada», «con_pujas» del certificado, «desierta»…). */
  resultado: string | null
}

export interface CalibracionZona {
  /** Provincia, o `(todas)` para el agregado global. */
  provincia: string
  /** Concluidas con resultado conocido. */
  muestra: number
  adjudicadas: number
  desiertas: number
  /** Mediana de importe/valor de las adjudicadas con ambas cifras. `null` sin datos. */
  ratioMediano: number | null
  /** Cuántas adjudicadas aportan al ratio (tienen importe y valor > 0). */
  muestraRatio: number
}

/** Muestra mínima por provincia para publicar su calibración. */
export const MIN_MUESTRA_CALIBRACION = 3

/**
 * Fila concluida ENRIQUECIDA con lo que se leyó de su certificación, para poder
 * contrastar teoría contra realidad: ¿de verdad se remata más bajo (o queda
 * desierta) una finca que arrastra cargas anteriores?
 */
export interface ResultadoConCargas extends ResultadoConcluido {
  /** Lo que heredaba el adjudicatario. `null` = no se llegó a leer. */
  cargasSubsistentes: number | null
  cargasConocidas: boolean
}

export interface CalibracionCargas {
  grupo: 'con_cargas' | 'sin_cargas' | 'sin_leer'
  muestra: number
  adjudicadas: number
  desiertas: number
  /** % de las concluidas que acabaron desiertas. */
  tasaDesierta: number | null
  ratioMediano: number | null
  muestraRatio: number
}

/**
 * Calibración por PRESENCIA DE CARGAS. Es la comprobación empírica de la regla
 * que este módulo aplica a mano: si el grupo `con_cargas` queda desierto mucho
 * más a menudo o se remata mucho más bajo, el mercado le está dando la razón al
 * semáforo, y el descuento exigido a esas fincas debería subir.
 *
 * Sin muestra no se concluye nada: se devuelven los grupos con sus contadores y
 * el ratio a `null`, para que la UI muestre «aún sin datos» en vez de un número
 * que no significa nada.
 */
export function calibracionPorCargas(filas: ResultadoConCargas[]): CalibracionCargas[] {
  const grupos: Array<CalibracionCargas['grupo']> = ['con_cargas', 'sin_cargas', 'sin_leer']

  return grupos.map((grupo) => {
    const delGrupo = filas.filter((f) => {
      if (!f.cargasConocidas || f.cargasSubsistentes == null) return grupo === 'sin_leer'
      return f.cargasSubsistentes > 0 ? grupo === 'con_cargas' : grupo === 'sin_cargas'
    })

    const adjudicadas = delGrupo.filter((f) => /adjudicad|con_?pujas/i.test(f.resultado ?? '')).length
    const desiertas = delGrupo.filter((f) => /desiert/i.test(f.resultado ?? '')).length
    const ratios = delGrupo
      .filter((f) => f.importeAdjudicacion != null && (f.valorSubasta ?? 0) > 0)
      .map((f) => f.importeAdjudicacion! / f.valorSubasta!)

    return {
      grupo,
      muestra: delGrupo.length,
      adjudicadas,
      desiertas,
      tasaDesierta: adjudicadas + desiertas > 0 ? desiertas / (adjudicadas + desiertas) : null,
      ratioMediano: mediana(ratios),
      muestraRatio: ratios.length,
    }
  })
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * Calibración por provincia + agregado global a partir de los resultados
 * capturados. Solo salen provincias con `minMuestra` concluidas; el agregado
 * `(todas)` sale siempre que haya al menos una.
 */
export function calibracionAdjudicaciones(
  filas: ResultadoConcluido[],
  minMuestra = MIN_MUESTRA_CALIBRACION,
): CalibracionZona[] {
  const conResultado = filas.filter((f) => f.resultado != null && f.resultado.trim() !== '')
  if (!conResultado.length) return []

  const grupos = new Map<string, ResultadoConcluido[]>()
  for (const f of conResultado) {
    const clave = (f.provincia ?? '').trim()
    if (!clave) continue
    const g = grupos.get(clave) ?? []
    g.push(f)
    grupos.set(clave, g)
  }

  const calibrar = (provincia: string, g: ResultadoConcluido[]): CalibracionZona => {
    const adjudicadas = g.filter((f) => /adjudicad|con_?pujas/i.test(f.resultado!))
    const ratios = adjudicadas
      .filter((f) => (f.importeAdjudicacion ?? 0) > 0 && (f.valorSubasta ?? 0) > 0)
      .map((f) => f.importeAdjudicacion! / f.valorSubasta!)
    return {
      provincia,
      muestra: g.length,
      adjudicadas: adjudicadas.length,
      desiertas: g.filter((f) => /desiert/i.test(f.resultado!)).length,
      ratioMediano: mediana(ratios),
      muestraRatio: ratios.length,
    }
  }

  const out = [...grupos.entries()]
    .filter(([, g]) => g.length >= minMuestra)
    .map(([prov, g]) => calibrar(prov, g))
    .sort((a, b) => b.muestra - a.muestra)
  out.push(calibrar('(todas)', conResultado))
  return out
}

// ── ¿Acertamos con la puja máxima? ──────────────────────────────────────────

/**
 * Una subasta concluida de la que ADEMÁS guardamos la puja máxima que el agente
 * había calculado antes del remate. Es el único material con el que se puede
 * saber si el modelo de coste es realista o si vive en otro mercado.
 */
export interface ResultadoConPuja extends ResultadoConcluido {
  /** Puja máxima que calculamos para el descuento objetivo. `null` = no se calculó. */
  pujaMaxima: number | null
}

export interface CalibracionPuja {
  /** Concluidas con puja calculada Y remate conocido. */
  muestra: number
  /** Las que se remataron POR ENCIMA de nuestro techo: no eran ganables. */
  porEncima: number
  /** Las que se remataron por debajo: eran ganables al precio que decíamos. */
  porDebajo: number
  /**
   * Mediana de `importeAdjudicacion / pujaMaxima`. > 1 = el mercado paga más de
   * lo que estábamos dispuestos a pujar (somos conservadores y no ganaremos
   * casi ninguna); < 1 = nuestro techo es holgado y podríamos apretar más.
   */
  ratioMediano: number | null
  /** Lectura en una frase, o `null` si no hay muestra suficiente. */
  lectura: string | null
}

/** Muestra mínima para atreverse a leer la desviación de la puja. */
export const MIN_MUESTRA_PUJA = 5

/**
 * Contrasta la puja máxima calculada contra el remate REAL.
 *
 * Es el bucle que cierra el sistema: hasta ahora el agente calculaba un techo
 * de puja y nadie comprobaba nunca si ese techo tenía algo que ver con lo que
 * de verdad pagó el mercado. Sin muestra suficiente devuelve `lectura: null`
 * en vez de una conclusión sacada de dos casos.
 */
export function calibracionPuja(
  filas: ResultadoConPuja[],
  minMuestra = MIN_MUESTRA_PUJA,
): CalibracionPuja {
  const utiles = filas.filter(
    (f) => (f.pujaMaxima ?? 0) > 0 && (f.importeAdjudicacion ?? 0) > 0 && /adjudicad|con_?pujas/i.test(f.resultado ?? ''),
  )

  const porEncima = utiles.filter((f) => f.importeAdjudicacion! > f.pujaMaxima!).length
  const ratios = utiles.map((f) => f.importeAdjudicacion! / f.pujaMaxima!)
  const ratioMediano = mediana(ratios)

  let lectura: string | null = null
  if (utiles.length >= minMuestra && ratioMediano != null) {
    const pct = Math.round(Math.abs(ratioMediano - 1) * 100)
    if (ratioMediano > 1.05) {
      lectura =
        `El mercado remata un ${pct}% POR ENCIMA de nuestra puja máxima (${porEncima} de ${utiles.length} casos): ` +
        'el descuento objetivo es demasiado exigente para estas zonas y casi nunca ganaremos una subasta.'
    } else if (ratioMediano < 0.95) {
      lectura =
        `El mercado remata un ${pct}% POR DEBAJO de nuestro techo (${utiles.length} casos): hay margen para exigir ` +
        'más descuento sin quedarnos fuera.'
    } else {
      lectura = `Nuestra puja máxima está en línea con el remate real (${utiles.length} casos).`
    }
  }

  return {
    muestra: utiles.length,
    porEncima,
    porDebajo: utiles.length - porEncima,
    ratioMediano,
    lectura,
  }
}
