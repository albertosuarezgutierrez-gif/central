// ────────────────────────────────────────────────────────────────────────────
// Mediciones del conector de Booking → curva de temporada mes a mes. Puro: no
// habla con la red ni con la BD, así que se puede testear entero.
//
// Existe porque un VUT de playa no tiene «una ocupación» ni «un precio»: en Conil
// el mismo apartamento de 4 plazas vale 332,50€/noche a finales de agosto y
// 92,24€ a mediados de noviembre (medido el 27/08/2026). Tarificar o valorar con
// una media anual es inventarse el negocio.
// ────────────────────────────────────────────────────────────────────────────

import type { MesMercado } from './tipos.ts'

export interface MedicionVentana {
  /** 1..12 */
  mes: number
  /** Plazas pedidas en la búsqueda: un piso de 12 plazas no se compara con uno de 4. */
  aforo: number
  /** Noches de la ventana (`checkout - checkin`). */
  noches: number
  /**
   * 🚨 `price.book` del conector es el TOTAL de la estancia, NO el precio por noche.
   * Se guarda tal cual llega y se divide aquí, en un sitio único y testeado.
   */
  totalesEstancia: number[]
  /**
   * Cuántos comparables se sabe que existen en el municipio para ese aforo. Con él
   * se puede estimar la saturación; sin él, la ocupación queda a `null` — que es
   * la verdad: el conector no da ocupación.
   */
  universoConocido: number | null
}

/** Mediana de una muestra. `null` con muestra vacía: no medir no es medir cero. */
export function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const orden = [...xs].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2
}

/** Convierte totales de estancia en precios por noche. Sin noches no hay conversión posible. */
export function preciosPorNoche(totales: number[], noches: number): number[] {
  if (!Number.isFinite(noches) || noches <= 0) return []
  return totales.filter(t => Number.isFinite(t) && t > 0).map(t => t / noches)
}

/**
 * Agrupa las ventanas del aforo pedido por mes y devuelve la curva ordenada.
 *
 * Un mes medido que no devolvió nada sale con `comparables: 0` y `adrGuest: null`:
 * «el conector no contestó» y «no hay mercado» son cosas distintas, y confundirlas
 * es justo lo que esta capa existe para evitar.
 */
export function construirCurva(mediciones: MedicionVentana[], aforo: number): MesMercado[] {
  const porMes = new Map<number, { precios: number[]; disponibles: number; universo: number | null }>()

  for (const m of mediciones) {
    if (m.aforo !== aforo) continue
    const acc = porMes.get(m.mes) ?? { precios: [], disponibles: 0, universo: null }
    const precios = preciosPorNoche(m.totalesEstancia, m.noches)
    acc.precios.push(...precios)
    acc.disponibles += precios.length
    if (m.universoConocido != null && m.universoConocido > 0) {
      acc.universo = (acc.universo ?? 0) + m.universoConocido
    }
    porMes.set(m.mes, acc)
  }

  return [...porMes.entries()]
    .map(([mes, acc]) => ({
      mes,
      adrGuest: mediana(acc.precios),
      comparables: acc.precios.length,
      ocupacionProxy: proxyOcupacion(acc.disponibles, acc.universo),
    }))
    .sort((a, b) => a.mes - b.mes)
}

/**
 * Saturación como proxy de ocupación: si de 10 comparables conocidos solo quedan 2
 * libres, el mercado va al 80%. Es una ESTIMACIÓN, no un dato de ocupación —
 * Booking no publica ocupación— y por eso viaja en un campo que la pantalla
 * etiqueta como proxy en vez de mezclarla con lo medido.
 */
function proxyOcupacion(disponibles: number, universo: number | null): number | null {
  if (universo == null || universo <= 0) return null
  return Math.min(1, Math.max(0, 1 - disponibles / universo))
}
