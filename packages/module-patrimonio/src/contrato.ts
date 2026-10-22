// Contratos de arrendamiento de LARGA ESTANCIA: renta vigente, fin efectivo y renta DEVENGADA por mes.
//
// Fase 1 no lleva cobros: la rentabilidad se calcula sobre lo DEVENGADO (lo que el contrato dice que toca),
// y la pantalla lo dice («renta según contrato, no cobros»). Un impago no se ve aquí; es Fase 2.

import { diasDelMes, diasEntre, fecha, maxFecha, minFecha, partes, sumarDias, type Fecha } from './fechas.ts'
import type { Centimos, Contrato } from './tipos.ts'

/**
 * Último día con contrato: `terminadoEn` manda SIEMPRE (también si es posterior al fin pactado: prórroga);
 * si no consta, el `fin` pactado; `null` = sin fin conocido.
 */
export function finEfectivo(c: Contrato): Fecha | null {
  return c.terminadoEn ?? c.fin
}

/** Renta mensual en vigor el día `dia` (última actualización con `desde` ≤ `dia`; si no, la inicial). */
export function rentaVigente(c: Contrato, dia: Fecha): Centimos {
  let renta = c.rentaMensual
  let desde: Fecha | null = null
  for (const a of c.actualizaciones) {
    if (a.desde <= dia && (desde === null || a.desde >= desde)) {
      renta = a.rentaMensual
      desde = a.desde
    }
  }
  return renta
}

export type EstadoContrato = 'futuro' | 'vigente' | 'terminado'

export function estadoContrato(c: Contrato, hoy: Fecha): EstadoContrato {
  // Solo `terminadoEn` termina un contrato. Pasado el fin PACTADO sin `terminadoEn`, la LAU puede haberlo
  // prorrogado (tácita o legalmente): sigue vigente y el calendario avisa de que hay que decidir.
  const fin = c.terminadoEn ? finEfectivo(c) : null
  if (fin && hoy > fin) return 'terminado'
  if (hoy < c.inicio) return 'futuro'
  return 'vigente'
}

export interface RentaMes {
  /** `YYYY-MM` */
  mes: string
  importe: Centimos
  /** Días del mes con contrato (menos que el mes entero = prorrateado). */
  dias: number
  diasMes: number
}

/**
 * Renta devengada mes a mes dentro de `[desde, hasta]`. Un mes parcial (entrada el 16, salida el 10, o
 * actualización a mitad de mes) se prorratea por días naturales de ESE mes; cada mes se redondea a céntimos.
 * Sin fin conocido, el contrato se considera vivo hasta `hasta` (el fin pactado pasado no corta la renta
 * si no consta `terminadoEn`: la LAU lo prorroga).
 */
export function rentaDevengada(c: Contrato, desde: Fecha, hasta: Fecha): RentaMes[] {
  const finReal = c.terminadoEn ? finEfectivo(c) : null
  const ini = maxFecha(c.inicio, desde)
  const fin = finReal ? minFecha(finReal, hasta) : hasta
  if (ini > fin) return []

  const out: RentaMes[] = []
  let cursor = ini
  while (cursor <= fin) {
    const { y, m } = partes(cursor)
    const dm = diasDelMes(y, m)
    const finMes = minFecha(fecha(y, m, dm), fin)
    // Suma día a día en «céntimos × día» (entero) y divide UNA vez al final: sin deriva de coma flotante.
    let acumulado = 0
    let dias = 0
    for (let d = cursor; d <= finMes; d = sumarDias(d, 1)) {
      acumulado += rentaVigente(c, d)
      dias++
    }
    out.push({ mes: cursor.slice(0, 7), importe: Math.round(acumulado / dm), dias, diasMes: dm })
    cursor = sumarDias(finMes, 1)
  }
  return out
}

export function totalRentaDevengada(c: Contrato, desde: Fecha, hasta: Fecha): Centimos {
  return rentaDevengada(c, desde, hasta).reduce((s, r) => s + r.importe, 0)
}

/** Días de contrato que quedan hasta el fin efectivo (`null` si no hay fin conocido). Negativo = pasado. */
export function diasHastaFin(c: Contrato, hoy: Fecha): number | null {
  const f = finEfectivo(c)
  return f ? diasEntre(hoy, f) : null
}
