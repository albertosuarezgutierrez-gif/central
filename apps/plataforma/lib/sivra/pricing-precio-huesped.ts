// lib/sivra/pricing-precio-huesped.ts — lo que ve el HUÉSPED, que no es lo que decide el motor.
//
// POR QUÉ (19/08/2026). El motor razona, decide y se autolimita en precio BASE: el ancla de
// mercado, el suelo `min_price`, el raíl ±%/día, el prior estacional… todo en base. Pero el
// huésped no paga la base: paga `markup × base + cuota_fija` (ver `pricing-canal.ts`). Mientras
// la cuota fija era invisible eso daba igual, porque base y precio del huésped eran proporcionales
// y bajar la una bajaba el otro en el mismo porcentaje.
//
// Con una cuota fija YA NO son proporcionales, y aparece un punto ciego caro:
//
//     House, cuota fija 597€ por estancia y estancia típica de 2 noches → 299€ POR NOCHE fijos.
//     El motor baja la base a su suelo (300€) creyendo que está regalando el piso…
//     …y el huésped sigue viendo 0,902 × 300 + 299 = 570€/noche.
//
// Es decir: el motor puede estar en su precio MÍNIMO y aun así listar muy por encima del mercado,
// sin que ningún raíl de los que tiene lo detecte — porque todos miran la base. Y al revés en las
// fechas caras: la cuota fija pesa poco y el precio del huésped sigue a la base casi exactamente.
// El error, como el del propio canal, NO es un porcentaje plano: se concentra en las noches
// baratas, que son justo las que peor se venden.
//
// Este módulo no decide precios: MIRA el precio ya aplicado y lo compara con el mercado de esa
// fecha, en la unidad correcta. Es un centinela, y como todos los de la casa distingue «no hay
// mercado con el que comparar» de «cuadra».
//
// ── 🚨 EL MERCADO ES DE LA FECHA, NUNCA DEL MES (03/09/2026) ─────────────────────────────────────
// Medido ese día: el aviso decía «House Sevillana 20/02/2027 a 1.320,00€/noche contra 450,00€ de
// mercado (×2,933)». Los 450€ eran la mediana de TODO febrero; el mercado REAL de esa noche era
// 948€ (p50 de 10 comps de booking_mcp), así que el ratio verdadero es 1,39 y no 2,93. Y esa noche
// es el Zurich Maratón de Sevilla del 21/02/2027 (40.000 dorsales): el mercado entero sube ×2,5 ese
// fin de semana y el motor lo siguió BIEN.
//
// O sea, el aviso señalaba como «el peor caso» la ÚNICA noche bien puesta y callaba sobre los
// martes normales, que es donde de verdad estamos caros (ratio medio entre semana 1,27-1,49 contra
// 1,09-1,37 en las noches del maratón). Comparar una fecha contra la mediana de su mes no es un
// número impreciso: es un número de OTRA cosa, y encima sesgado justo en las fechas caras, que son
// las que deciden el ingreso. Dos consecuencias, las dos en este módulo:
//   · la mediana llega ya calculada sobre una ventana de ±VENTANA_DIAS_MERCADO días de la PROPIA
//     fecha, y una fecha sin MIN_COMPS_FECHA comparables llega con `medMercadoGuest = null` →
//     `sin_mercado`. NO cae a la mediana del mes: en esta casa un NULL es «no se sabe» y no se
//     colapsa con un valor (regla global del CLAUDE.md raíz);
//   · el veredicto viaja con `hayEvento`, y `peores` antepone las fechas caras SIN evento — que son
//     las accionables — para que el aviso no vuelva a encabezarse con la noche del maratón.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

import { guestDesdeBase, fijoPorNoche, type ParametrosCanal } from './pricing-canal.ts'

export interface FechaHuesped {
  /** YYYY-MM-DD */
  fecha: string
  /** precio BASE vivo en Smoobu para esa noche */
  baseAplicada: number
  /**
   * Mediana de mercado de ESA FECHA en precio GUEST (la misma unidad en la que compra el huésped),
   * medida sobre una ventana de ±`VENTANA_DIAS_MERCADO` días alrededor de ella.
   * `null` = no hay corpus suficiente con el que comparar: no se juzga, se cuenta aparte. Nunca se
   * rellena con la mediana del MES — ver la cabecera de este módulo.
   */
  medMercadoGuest: number | null
  /**
   * ¿Esa noche tiene un evento que mueve el mercado entero (maratón, Feria, Bienal…)?
   * TRES estados a propósito: `true` = lo tiene · `false` = se ha mirado y no lo tiene ·
   * `null`/ausente = NO se ha podido mirar. Un «no lo sé» no puede pintarse como «martes normal»:
   * es justo la distinción que hace accionable el aviso.
   */
  hayEvento?: boolean | null
}

export type EstadoHuesped = 'sin_mercado' | 'ok' | 'caro' | 'barato'

export interface VeredictoHuesped {
  fecha: string
  /** lo que ve el huésped por esa noche con la base aplicada */
  guest: number
  medMercadoGuest: number | null
  /** guest / mercado. `null` sin mercado. */
  ratio: number | null
  /**
   * Qué parte del precio del huésped es cuota fija, en tanto por uno. Es la medida del punto
   * ciego: cuanto más alto, menos puede el motor mover el precio real tocando la base.
   */
  pesoCuota: number
  estado: EstadoHuesped
  /** `null` = no se ha podido comprobar si esa noche tiene evento (ver `FechaHuesped.hayEvento`). */
  hayEvento: boolean | null
}

export interface ResumenHuesped {
  fechas: VeredictoHuesped[]
  /** recuentos por estado; `sin_mercado` va SIEMPRE aparte de `ok` */
  caras: number
  baratas: number
  ok: number
  sinMercado: number
  /**
   * Desglose de las CARAS por evento. Es lo que separa «estamos caros» de «esa noche el mercado
   * entero sube y le seguimos»: los tres cubos suman `caras` y ninguno se colapsa con otro.
   */
  carasSinEvento: number
  carasConEvento: number
  carasEventoSinComprobar: number
  /**
   * Las peores para el aviso, ya ordenadas: primero las CARAS SIN evento (las accionables), luego
   * las caras cuyo evento no se ha podido comprobar, luego las caras con evento, y solo después el
   * resto. Dentro de cada grupo, por ratio descendente.
   */
  peores: VeredictoHuesped[]
}

/**
 * Radio en días de la ventana con la que se mide el mercado de UNA fecha (±3 → 7 noches).
 *
 * El número es un compromiso medido: con ±0 días muchas fechas se quedan sin muestra (el barrido no
 * mide las 180 noches del horizonte todos los días) y con una ventana ancha se vuelve a promediar la
 * noche especial con las normales, que es el fallo que este módulo existe para no cometer. ±3 días
 * mantiene el fin de semana dentro del fin de semana y el maratón dentro del maratón.
 */
export const VENTANA_DIAS_MERCADO = 3
/**
 * Comparables mínimos dentro de esa ventana para atreverse a decir «el mercado de esta noche es X».
 * Por debajo, `medMercadoGuest` viaja como `null` («no se sabe») — NUNCA como la mediana del mes.
 * Mismo umbral que el `MIN_SAMPLE` del motor (`pricing/apply`): una muestra que no basta para
 * tarificar tampoco basta para acusar de caro.
 */
export const MIN_COMPS_FECHA = 5

/** Por encima de esto listamos caro para lo que dice el mercado de esa fecha. */
export const TOPE_CARO = 1.25
/** Por debajo de esto estamos regalando la noche. */
export const SUELO_BARATO = 0.75

/**
 * Juzga el precio que ve el huésped fecha a fecha, contra el mercado de ESA fecha.
 *
 * `peores` solo contiene fechas juzgables —una fecha sin mercado nunca puede encabezar un aviso de
 * «estás caro», porque no se sabe— y va ordenado por ACCIONABILIDAD antes que por ratio: primero
 * las caras sin evento, después las caras cuyo evento no se ha podido comprobar, después las caras
 * con evento y al final el resto. Ordenar solo por ratio hacía que el aviso lo encabezara siempre
 * una noche de evento (ver la cabecera del módulo, 03/09/2026): el ratio más alto del mes lo tiene
 * casi siempre la noche en la que el mercado entero se dispara, y esa es justo la que NO hay que
 * tocar.
 */
export function precioHuesped(
  fechas: FechaHuesped[],
  params: ParametrosCanal,
  opts: { topeCaro?: number; sueloBarato?: number; maxPeores?: number } = {},
): ResumenHuesped {
  const topeCaro = opts.topeCaro ?? TOPE_CARO
  const sueloBarato = opts.sueloBarato ?? SUELO_BARATO
  const maxPeores = opts.maxPeores ?? 5
  const fijo = fijoPorNoche(params)

  const veredictos: VeredictoHuesped[] = (fechas ?? [])
    .filter(f => Number(f.baseAplicada) > 0)
    .map(f => {
      const guest = guestDesdeBase(Number(f.baseAplicada), params)
      const mercado = f.medMercadoGuest != null && Number(f.medMercadoGuest) > 0
        ? Number(f.medMercadoGuest) : null
      const ratio = mercado != null ? Number((guest / mercado).toFixed(3)) : null
      const estado: EstadoHuesped = ratio == null ? 'sin_mercado'
        : ratio > topeCaro ? 'caro'
        : ratio < sueloBarato ? 'barato'
        : 'ok'
      return {
        fecha: f.fecha, guest, medMercadoGuest: mercado, ratio,
        pesoCuota: guest > 0 ? Number((fijo / guest).toFixed(3)) : 0,
        estado,
        hayEvento: f.hayEvento ?? null,
      }
    })

  const caras = veredictos.filter(v => v.estado === 'caro')

  return {
    fechas: veredictos,
    caras: caras.length,
    baratas: veredictos.filter(v => v.estado === 'barato').length,
    ok: veredictos.filter(v => v.estado === 'ok').length,
    sinMercado: veredictos.filter(v => v.estado === 'sin_mercado').length,
    carasSinEvento: caras.filter(v => v.hayEvento === false).length,
    carasConEvento: caras.filter(v => v.hayEvento === true).length,
    carasEventoSinComprobar: caras.filter(v => v.hayEvento == null).length,
    peores: veredictos
      .filter(v => v.ratio != null)
      .sort((a, b) => prioridadAviso(a) - prioridadAviso(b) || b.ratio! - a.ratio!)
      .slice(0, maxPeores),
  }
}

/**
 * Orden del aviso: lo accionable primero. Una noche de evento cara puede estar PERFECTAMENTE puesta
 * (el mercado entero sube y le seguimos), así que no puede desplazar del titular a un martes normal
 * en el que sí estamos caros por decisión nuestra. El «no se ha podido comprobar» va en medio: no
 * se promociona a accionable, pero tampoco se entierra con los eventos confirmados.
 */
function prioridadAviso(v: VeredictoHuesped): number {
  const evento = v.hayEvento === false ? 0 : v.hayEvento == null ? 1 : 2
  return (v.estado === 'caro' ? 0 : 4) + evento
}

/**
 * Precio BASE por debajo del cual bajar ya no sirve de nada porque el precio del huésped apenas se
 * mueve: la cuota fija ya es la mayor parte de lo que paga.
 *
 * Es el número que le falta al motor para saber cuándo dejar de bajar y cambiar de palanca (mínimo
 * de noches, oferta del portal, cerrar la fecha). Devuelve la base en la que la cuota fija alcanza
 * `pesoMaximo` del precio del huésped; sin cuota fija no hay tal punto y devuelve `null`.
 */
export function baseDondeLaCuotaMandaya(
  params: ParametrosCanal,
  pesoMaximo = 0.5,
): number | null {
  const fijo = fijoPorNoche(params)
  const m = Number(params.markup)
  if (!(fijo > 0) || !(m > 0) || !(pesoMaximo > 0) || pesoMaximo >= 1) return null
  // fijo / (m·base + fijo) = peso  →  base = fijo·(1 − peso) / (m·peso)
  return Math.max(1, Math.round((fijo * (1 - pesoMaximo)) / (m * pesoMaximo)))
}
