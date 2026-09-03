// lib/sivra/pricing-calibracion.ts — ¿el precio que PEDIMOS tiene algo que ver con el que COBRAMOS?
// Módulo PURO (sin BD ni red), testeable con `node --test`. Lo consume el guardián de precios
// (`app/api/sivra/pricing/guard/route.ts`, checks #12 y #13).
//
// 🚨 POR QUÉ EXISTE (medido el 03/09/2026). Los cuatro pisos de SIVRA llevaban MESES tarificando muy
// por encima del precio al que de verdad se venden, y ningún guardián se enteró: todos los centinelas
// de precio comparaban el precio VIVO contra el MERCADO, y ahí todo salía bien. Nadie comparaba el
// precio vivo contra LO QUE HEMOS COBRADO. Los datos:
//
//     piso                  ADR bruto real (13 m)   percentil REAL donde vende   target_pctl
//     prop_busto_reform            84 €                      P9                     0,55
//     prop_luxury_busto           135 €                      P19                    0,50
//     prop_duplex_center          111 €                      P22                    0,60
//     prop_house_sevillana        560 €                      P57                    0,60
//
// House es el único calibrado donde vende — y es el único que llena (23% de ocupación a 180 días
// contra 6,6-11,6% de los otros tres). Los otros tres piden ×1,6-3,1 lo que han cobrado nunca.
//
// Y el segundo hallazgo, que es el que explica por qué el motor no lo corregía solo: TODAS sus
// palancas de bajada están topadas o muertas. El clamp de calidad da −10%, el prior estacional −15%
// pero solo entra si NO hay bucket de mes (y siempre lo hay), la urgencia con k=0,5 da −12,5% y solo
// pegada a la fecha, y `pilot_enabled` NO escribe precio: solo anota. Sumadas dan ~−25% cuando hacía
// falta −40%. El motor no es que decidiera mal: es que NO PODÍA llegar, y nada lo decía.
//
// Los dos principios de la casa, que aquí son el módulo entero:
//   1. SIN MUESTRA NO SE OPINA. `sin_muestra` NUNCA es `ok`. Un percentil inventado con 3 noches
//      vendidas es exactamente la clase de afirmación falsa sobre la que se decide (regla NULL ≠ 0).
//   2. CONSERVADOR. Umbrales holgados: el pecado capital es la falsa alarma que hace ignorar el canal.

// ─── Constantes (exportadas: los tests y el guardián leen de aquí, no de literales sueltos) ──────

/** Noches vendidas mínimas para que un ADR realizado signifique algo. Por debajo → `sin_muestra`. */
export const MIN_NOCHES_MUESTRA = 30

/**
 * Comparables mínimos del corpus del piso para poder situar un ADR en un percentil.
 * 25 es el mismo listón que el guardián exige al p50 BLENDED en el check #5 (un corpus que agrega
 * muchas fechas no se juzga con una muestra floja).
 */
export const MIN_COMPS_CORPUS = 25

/** Brecha de percentil a partir de la cual la calibración está DESVIADA (15 puntos de percentil). */
export const BRECHA_DESVIADO = 0.15
/** Brecha a partir de la cual es GRAVE (30 puntos). Con los datos del 03/09 los tres pisos caen aquí. */
export const BRECHA_GRAVE = 0.30

/**
 * Holgura al comparar el recorrido del motor con la bajada que haría falta: por debajo de 2 puntos
 * porcentuales no se avisa (el redondeo del motor y el markup de canal ya valen eso).
 */
export const MARGEN_RECORRIDO = 0.02

// ─── Utilidades de percentil ─────────────────────────────────────────────────────────────────────

/**
 * Precio del corpus en un percentil dado, con interpolación lineal — el mismo criterio que
 * `percentile_cont` de Postgres, que es lo que usa el motor para sacar su ancla.
 * Devuelve `null` si no hay corpus o el percentil no es un número entre 0 y 1.
 */
export function precioEnPercentil(precios: number[], pctl: number): number | null {
  const xs = precios.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b)
  if (xs.length === 0) return null
  if (!Number.isFinite(pctl) || pctl < 0 || pctl > 1) return null
  if (xs.length === 1) return xs[0]
  const pos = (xs.length - 1) * pctl
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return xs[lo]
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)
}

/**
 * Fracción del corpus que queda ESTRICTAMENTE por debajo de `valor` (0 = más barato que todo,
 * 1 = más caro que todo). `null` sin corpus. Es la definición espejo de `precioEnPercentil`:
 * dónde cae un precio nuestro dentro del mercado.
 */
export function percentilDe(precios: number[], valor: number): number | null {
  const xs = precios.filter((p) => Number.isFinite(p) && p > 0)
  if (xs.length === 0 || !Number.isFinite(valor)) return null
  let bajo = 0
  for (const p of xs) if (p < valor) bajo++
  return bajo / xs.length
}

// ─── Check A: «vendemos en un percentil y tarificamos en otro» ───────────────────────────────────

export type CalibracionInput = {
  /** ADR BRUTO realmente vendido (ingreso bruto / noches) de los últimos ~13 meses. null = no medido. */
  adrReal: number | null
  /** noches que sostienen ese ADR (el denominador; sin él no se sabe si el ADR significa algo) */
  nochesMuestra: number
  /** corpus de comparables del piso, ya normalizado por aforo — el mismo que ancla el motor */
  preciosMercado: number[]
  /** percentil de mercado al que el motor DICE que queremos vender (`pricing_settings.target_pctl`) */
  targetPctl: number
}

export type CalibracionEstado = 'ok' | 'desviado' | 'grave' | 'sin_muestra'

export type CalibracionResult = {
  /** percentil del mercado en el que de VERDAD vendemos. `null` = no se ha podido medir. */
  pctlReal: number | null
  targetPctl: number
  /**
   * `targetPctl - pctlReal`, con signo:
   *   · positivo = pedimos MÁS ARRIBA de donde vendemos (el caso del 03/09: pedir P55, vender P9)
   *   · negativo = vendemos más caro de lo que pedimos (regalamos precio: también es descalibrar)
   * `null` cuando no hay muestra.
   */
  brecha: number | null
  estado: CalibracionEstado
  /** precio del mercado en `targetPctl`: lo que el motor toma como ancla. `null` sin corpus. */
  ancla: number | null
  motivo: string
}

/**
 * ¿Coincide el percentil de mercado en el que VENDEMOS con el que el motor tiene configurado?
 *
 * Sin ADR, sin noches suficientes o sin corpus devuelve `sin_muestra` — y `sin_muestra` NO es `ok`:
 * es «no lo sé», que es justo lo que hay que decir cuando no se ha mirado. Inventarse aquí un
 * percentil con cuatro noches vendidas sería repetir el fallo que este módulo viene a tapar.
 */
export function brechaCalibracion(i: CalibracionInput): CalibracionResult {
  const target = Number(i.targetPctl)
  const corpus = (i.preciosMercado ?? []).filter((p) => Number.isFinite(p) && p > 0)
  const ancla = precioEnPercentil(corpus, target)
  const vacio = (motivo: string): CalibracionResult => ({
    pctlReal: null, targetPctl: target, brecha: null, estado: 'sin_muestra', ancla, motivo,
  })

  if (!Number.isFinite(target) || target < 0 || target > 1) {
    return vacio(`target_pctl inválido (${i.targetPctl}): no hay contra qué comparar`)
  }
  if (i.adrReal == null || !Number.isFinite(i.adrReal) || i.adrReal <= 0) {
    return vacio('sin ADR realizado: este piso no ha cobrado nada medible en la ventana')
  }
  if (!Number.isFinite(i.nochesMuestra) || i.nochesMuestra < MIN_NOCHES_MUESTRA) {
    return vacio(
      `solo ${Number.isFinite(i.nochesMuestra) ? i.nochesMuestra : 0} noches vendidas ` +
      `(<${MIN_NOCHES_MUESTRA}): el ADR no sostiene un percentil`,
    )
  }
  if (corpus.length < MIN_COMPS_CORPUS) {
    return vacio(`corpus de mercado de ${corpus.length} comps (<${MIN_COMPS_CORPUS}): no se puede situar el ADR`)
  }

  const pctlReal = percentilDe(corpus, i.adrReal)!
  const brecha = target - pctlReal
  // Se redondea a 6 decimales ANTES de comparar: `0,50 - 0,35` da 0,15000000000000002 en coma
  // flotante y un piso justo en el umbral saltaría a «desviado» por ruido binario, no por precio.
  const abs = Math.abs(Number(brecha.toFixed(6)))
  const pct = (x: number) => `P${Math.round(x * 100)}`

  if (abs <= BRECHA_DESVIADO) {
    return {
      pctlReal, targetPctl: target, brecha, estado: 'ok', ancla,
      motivo: `vende en ${pct(pctlReal)} y tarifica a ${pct(target)}: calibrado`,
    }
  }
  const estado: CalibracionEstado = abs > BRECHA_GRAVE ? 'grave' : 'desviado'
  const sentido = brecha > 0
    ? `pide muy por ENCIMA de donde vende`
    : `vende por ENCIMA de lo que pide (está regalando precio)`
  return {
    pctlReal, targetPctl: target, brecha, estado, ancla,
    motivo:
      `vende de verdad en ${pct(pctlReal)} del mercado (ADR ${Math.round(i.adrReal)}€ sobre ` +
      `${i.nochesMuestra} noches) y el motor tarifica a ${pct(target)}` +
      (ancla ? ` (ancla ~${Math.round(ancla)}€)` : '') + `: ${sentido}.`,
  }
}

/**
 * Fracción del ancla a la que habría que llegar para tarificar donde de verdad se vende
 * (`adrReal / precio del mercado en targetPctl`). 1 = el ancla ya es el precio realizado; 0,6 = hay
 * que bajar un 40% desde el ancla. `null` si falta cualquiera de las dos piezas.
 *
 * Es una aproximación declarada: el ADR bruto es lo que pagó el huésped por noche y el ancla es el
 * precio de mercado por noche del mismo aforo, así que se comparan en la misma unidad; lo que NO
 * captura son los factores del motor posteriores al ancla (position_factor, demanda, eventos), que
 * empujan hacia arriba. Por eso el resultado es un LÍMITE OPTIMISTA: si con esto ya no alcanza,
 * con el motor completo tampoco.
 */
export function fraccionNecesaria(i: {
  adrReal: number | null
  preciosMercado: number[]
  targetPctl: number
}): number | null {
  if (i.adrReal == null || !Number.isFinite(i.adrReal) || i.adrReal <= 0) return null
  const ancla = precioEnPercentil(i.preciosMercado ?? [], Number(i.targetPctl))
  if (ancla == null || !(ancla > 0)) return null
  return i.adrReal / ancla
}

// ─── Check B: «el motor no PUEDE llegar al precio que necesita» ──────────────────────────────────

export type RecorridoInput = {
  /** suelo del clamp de calidad del motor (0,90 = como mucho −10%) */
  clampCalidadMin: number
  /** tope de bajada del prior estacional (`BAJADA_MAX` de prior-estacional.ts, 0,85 = −15%) */
  priorBajadaMax: number
  /** false si el prior a la baja solo entra SIN bucket de mes y el piso siempre tiene bucket */
  priorBajadaViva: boolean
  /** `pricing_settings.lastminute_k`. 0 = palanca apagada */
  lastminuteK: number
  /** descuento máximo de la urgencia con k=1 (por defecto 0,25 en pricing-lastminute.ts) */
  lastminuteDescuentoMax: number
  /** ¿el piloto ESCRIBE precio? Hoy `pilot_enabled` solo anota: no mueve un euro */
  pilotEscribe: boolean
}

export type RecorridoResult = {
  /** precio mínimo alcanzable como fracción del ancla (1 = el motor no puede bajar del ancla) */
  recorridoMin: number
  /** palancas que NO actúan (apagadas, sin efecto o que no escriben precio) */
  palancasMuertas: string[]
}

/**
 * ¿Hasta dónde puede bajar el motor desde su ancla, multiplicando SOLO las palancas que de verdad
 * actúan? Devuelve el mejor caso: todas las palancas vivas a tope y a la vez (la urgencia solo pega
 * pegada a la fecha, así que el recorrido real del horizonte completo es MENOR que este número).
 * Si ni siquiera este límite optimista alcanza, el motor no puede llegar y punto.
 */
export function recorridoPalancas(i: RecorridoInput): RecorridoResult {
  const muertas: string[] = []
  let f = 1

  const cal = Number(i.clampCalidadMin)
  if (Number.isFinite(cal) && cal > 0 && cal < 1) f *= cal
  else muertas.push('clamp_calidad')

  const prior = Number(i.priorBajadaMax)
  if (i.priorBajadaViva && Number.isFinite(prior) && prior > 0 && prior < 1) f *= prior
  else muertas.push('prior_estacional')

  const k = Number(i.lastminuteK)
  const dmax = Number(i.lastminuteDescuentoMax)
  const desc = Number.isFinite(k) && Number.isFinite(dmax) ? Math.min(1, Math.max(0, k)) * Math.min(1, Math.max(0, dmax)) : 0
  if (desc > 0) f *= 1 - desc
  else muertas.push('lastminute')

  // El piloto nunca multiplica: o escribe el precio que decide, o no existe para el precio.
  if (!i.pilotEscribe) muertas.push('piloto')

  return { recorridoMin: Number(f.toFixed(6)), palancasMuertas: muertas }
}

export type RecorridoVeredicto = {
  alerta: boolean
  /** false = no había con qué decidir. NO confundir con «el motor llega de sobra». */
  evaluado: boolean
  /** puntos porcentuales del ancla que le faltan al motor para llegar. `null` si no se evaluó. */
  faltanPct: number | null
  motivo: string
}

/**
 * ¿Alcanza el recorrido del motor la bajada que hace falta?
 *
 * Sin `fraccionNecesaria` (sin ADR o sin corpus) NO se opina: `evaluado:false`. Y solo se avisa
 * cuando hace falta BAJAR (fracción < 1); si el precio realizado está por encima del ancla, el
 * recorrido de bajada no es el problema y este check calla.
 */
export function decidirRecorrido(i: {
  recorridoMin: number
  fraccionNecesaria: number | null
  palancasMuertas: string[]
}): RecorridoVeredicto {
  const muertas = i.palancasMuertas ?? []
  if (i.fraccionNecesaria == null || !Number.isFinite(i.fraccionNecesaria) || i.fraccionNecesaria <= 0) {
    return { alerta: false, evaluado: false, faltanPct: null, motivo: 'sin ADR o sin corpus: no se sabe a dónde hay que llegar' }
  }
  if (!Number.isFinite(i.recorridoMin) || i.recorridoMin <= 0 || i.recorridoMin > 1) {
    return { alerta: false, evaluado: false, faltanPct: null, motivo: 'recorrido de palancas no medible' }
  }
  const pct = (x: number) => `${Math.round(x * 100)}%`
  if (i.fraccionNecesaria >= 1) {
    return {
      alerta: false, evaluado: true, faltanPct: null,
      motivo: `el precio realizado (${pct(i.fraccionNecesaria)} del ancla) no está por debajo del ancla: no hace falta bajar`,
    }
  }
  const faltan = i.recorridoMin - i.fraccionNecesaria
  if (faltan <= MARGEN_RECORRIDO) {
    return {
      alerta: false, evaluado: true, faltanPct: faltan,
      motivo:
        `el motor puede bajar hasta el ${pct(i.recorridoMin)} del ancla y hace falta el ` +
        `${pct(i.fraccionNecesaria)}: llega`,
    }
  }
  return {
    alerta: true, evaluado: true, faltanPct: faltan,
    motivo:
      `haría falta bajar al ${pct(i.fraccionNecesaria)} del ancla y el motor, con TODAS sus palancas ` +
      `vivas a tope a la vez, solo llega al ${pct(i.recorridoMin)}: le faltan ` +
      `${Math.round(faltan * 100)} puntos` +
      (muertas.length ? `. Palancas que no actúan: ${muertas.join(', ')}.` : '.'),
  }
}
