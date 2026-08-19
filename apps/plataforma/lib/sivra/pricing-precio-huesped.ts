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
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

import { guestDesdeBase, fijoPorNoche, type ParametrosCanal } from './pricing-canal.ts'

export interface FechaHuesped {
  /** YYYY-MM-DD */
  fecha: string
  /** precio BASE vivo en Smoobu para esa noche */
  baseAplicada: number
  /**
   * Mediana de mercado de esa fecha en precio GUEST (la misma unidad en la que compra el huésped).
   * `null` = no hay corpus con el que comparar: no se juzga, se cuenta aparte.
   */
  medMercadoGuest: number | null
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
}

export interface ResumenHuesped {
  fechas: VeredictoHuesped[]
  /** recuentos por estado; `sin_mercado` va SIEMPRE aparte de `ok` */
  caras: number
  baratas: number
  ok: number
  sinMercado: number
  /** las peores por ratio (para el aviso), ya ordenadas */
  peores: VeredictoHuesped[]
}

/** Por encima de esto listamos caro para lo que dice el mercado de esa fecha. */
export const TOPE_CARO = 1.25
/** Por debajo de esto estamos regalando la noche. */
export const SUELO_BARATO = 0.75

/**
 * Juzga el precio que ve el huésped fecha a fecha.
 *
 * `peores` sale ordenado por ratio descendente y solo contiene fechas juzgables: una fecha sin
 * mercado nunca puede encabezar un aviso de «estás caro», porque no se sabe.
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
      }
    })

  return {
    fechas: veredictos,
    caras: veredictos.filter(v => v.estado === 'caro').length,
    baratas: veredictos.filter(v => v.estado === 'barato').length,
    ok: veredictos.filter(v => v.estado === 'ok').length,
    sinMercado: veredictos.filter(v => v.estado === 'sin_mercado').length,
    peores: veredictos
      .filter(v => v.ratio != null)
      .sort((a, b) => b.ratio! - a.ratio!)
      .slice(0, maxPeores),
  }
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
