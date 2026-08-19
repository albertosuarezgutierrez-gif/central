// lib/sivra/pricing-premio-mercado.ts — lógica PURA (sin BD ni red) del "premio de mercado por fecha".
//
// Contexto (22/07/2026): el motor (`apply/route.ts`) solo consultaba el mercado por FECHA EXACTA
// cuando había un factor de evento del CALENDARIO (`if (ev > 1)`). Karol G (11-jun-27) y Feria
// (15-abr-27) se vendieron baratas (344€/140€) porque Ticketmaster/websearch NO las habían
// flagueado en su momento, así que —aunque el conector SÍ tenía 931€/424€ para esos días— el motor
// las tarifaba con el bucket del MES (junio/abril "normal") y las hundía.
//
// Esta función detecta ese caso: si el mercado del PROPIO día va MUY por encima de su base normal,
// es una fecha premium aunque el calendario no la conozca. Ancla al mercado de ESA fecha TAL CUAL
// (con el ajuste demanda/calidad del motor), NUNCA multiplicado por un factor → evita el doble
// conteo que infló Karol G hacia ~2.000€ el 18/07. Solo SUBE (el motor la aplica como salto de
// evento, saltándose el raíl ±%/día); las bajadas siguen el raíl.
//
// El umbral por defecto (1.5×) separa el EVENTO real (1,5-5× el mes) del premio normal de FINDE
// (~1,1-1,4× el mes, porque la mediana del mes mezcla entre semana y findes). Así no encarece un
// sábado corriente; solo dispara en fechas genuinamente especiales. Pura → testeable con node --test.

import { baseDesdeGuestConFijo } from "./pricing-canal.ts"

export type PremioMercadoInput = {
  /** mediana de mercado (precio GUEST) de la FECHA exacta */
  medFechaGuest: number
  /** nº de comps que forman esa mediana de fecha */
  comps: number
  /** base "normal" del día (mes/global), en la MISMA unidad (base, sin markup) que el target del motor */
  normalBase: number
  /** multiplicador del canal (`escaparate = markup × base + cuota fija`) */
  markup: number
  /** parte FIJA que el canal suma a esta noche (cuota por estancia ÷ noches típicas). Obligatoria. */
  fijoNoche: number
  /** ajuste demanda/calidad del motor (recommended_guest / med_guest_global) */
  dqFactor: number
}

export type PremioMercadoOpts = {
  /** comps mínimos de la fecha para fiarnos de su mediana */
  minComps?: number
  /** cuánto ha de superar la base de la fecha a la base normal para contar como premium de evento */
  ratio?: number
}

/**
 * Devuelve el precio BASE (sin markup) al que anclar la fecha como premium de mercado, o 0 si no
 * aplica. `target_final = max(target, premio)` en el motor, y el premio salta el raíl al alza.
 */
export function premioMercadoFecha(i: PremioMercadoInput, o: PremioMercadoOpts = {}): number {
  const minComps = o.minComps ?? 3
  const ratio = o.ratio ?? 1.5
  if (i.comps < minComps) return 0
  if (i.medFechaGuest <= 0 || i.markup <= 0 || i.normalBase <= 0) return 0
  const baseFecha = baseDesdeGuestConFijo(i.medFechaGuest * i.dqFactor, i.markup, i.fijoNoche)
  if (baseFecha < ratio * i.normalBase) return 0
  return baseFecha
}
