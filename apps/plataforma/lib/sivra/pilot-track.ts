// Lógica PURA del agente de seguimiento del piloto (sin DB ni red → testeable por inspección).
// El endpoint /api/sivra/pricing/pilot-track aporta los datos; aquí solo se decide el veredicto.

export type PilotInput = {
  windowNights: number       // noches con dato en la ventana (cobertura real del snapshot)
  freeNights: number         // noches LIBRES (available=1) en la ventana
  bookedNights: number       // noches REALMENTE reservadas (cruce con incomes), no solo available=0
  daysSinceBooking: number   // días desde la última reserva NUEVA creada
  threshold: number          // pilot_no_booking_days (def. 7)
  currentBase: number | null // precio base actual en Smoobu
  marketP50Guest: number | null // mediana del mercado (precio HUÉSPED) — para el diagnóstico
  channelMarkup: number      // multiplicador del canal (escaparate = markup × base + cuota fija)
  // Parte FIJA que el canal suma a la noche (cuota por estancia ÷ noches típicas). Sin ella, el
  // «precio huésped» que se compara contra el p50 del mercado sale corto y el diagnóstico dice
  // «no estamos caros» cuando sí lo estamos: en House son ~299€ POR NOCHE de diferencia.
  channelFijoNoche: number
  minPrice: number | null    // suelo de coste (nunca bajar de aquí)
  recommendedBase: number | null   // precio base recomendado por el MOTOR (lib/sivra/pricing-engine)
  recommendationConfident: boolean // mercado sólido (≥5 comps) y fresco (≤7d)
}

export type PilotVerdict = {
  verdict: "verde" | "amarillo" | "rojo"
  diagnosis: string
  proposal: string | null
  proposedBase: number | null
}

// Mínimo de noches con dato para fiarnos del veredicto (el snapshot debe cubrir ≥2 semanas).
export const MIN_WINDOW_NIGHTS = 14

// Anti-falso-🔴 / anti-falso-🟢: separa "sin datos", "todo bloqueado", "todo reservado" y "sin demanda".
export function evaluatePilot(i: PilotInput): PilotVerdict {
  // Datos insuficientes: NO afirmamos nada (ni verde "todo reservado" ni rojo). Lo separa del watchdog.
  if (i.windowNights < MIN_WINDOW_NIGHTS) {
    return {
      verdict: "amarillo",
      diagnosis: `Datos insuficientes: la ventana solo cubre ${i.windowNights} noche(s). Espera al snapshot a 90d.`,
      proposal: null,
      proposedBase: null,
    }
  }

  const guestPrice =
    i.currentBase != null
      ? Math.round(i.currentBase * i.channelMarkup + (i.channelFijoNoche > 0 ? i.channelFijoNoche : 0))
      : null
  const overMarket =
    guestPrice != null && i.marketP50Guest != null && guestPrice > i.marketP50Guest

  // Sin inventario libre: distinguir reservado (bueno) de bloqueado (no vende, no es éxito).
  if (i.freeNights === 0) {
    const mayoritariamenteReservado = i.bookedNights >= Math.ceil(i.windowNights * 0.6)
    return mayoritariamenteReservado
      ? { verdict: "verde", diagnosis: `Sin inventario libre: ${i.bookedNights}/${i.windowNights} noches reservadas.`, proposal: null, proposedBase: null }
      : { verdict: "amarillo", diagnosis: `Sin fechas libres pero solo ${i.bookedNights}/${i.windowNights} reservadas: el resto están BLOQUEADAS, no vendidas.`, proposal: null, proposedBase: null }
  }

  if (i.daysSinceBooking >= i.threshold) {
    // Diagnóstico (#4): distinguir "estamos caros" de "no hay demanda en general".
    const diagnosis = overMarket
      ? `Sin reservas ${i.daysSinceBooking}d y por encima del mercado (huésped ${guestPrice}€ > p50 ${i.marketP50Guest}€).`
      : `Sin reservas ${i.daysSinceBooking}d pero NO estamos caros (huésped ${
          guestPrice ?? "?"
        }€ ≤ mercado). Probable demanda baja general en esas fechas.`

    // Propuesta (#6, solo PROPONE): usa el precio del MOTOR compartido (recommend), NO una fórmula
    // aparte. Solo si el mercado es de confianza y el recomendado baja respecto al actual.
    const proposedBase =
      i.recommendationConfident && i.recommendedBase != null && i.currentBase != null &&
      i.recommendedBase < i.currentBase
        ? i.recommendedBase
        : null
    const proposal =
      proposedBase != null && i.currentBase != null
        ? `Bajar base ${i.currentBase}€ → ${proposedBase}€ (huésped ~${Math.round(proposedBase * i.channelMarkup + (i.channelFijoNoche > 0 ? i.channelFijoNoche : 0))}€).`
        : null

    return { verdict: "rojo", diagnosis, proposal, proposedBase }
  }

  if (i.daysSinceBooking >= Math.ceil(i.threshold / 2)) {
    return {
      verdict: "amarillo",
      diagnosis: `Sin reservas ${i.daysSinceBooking}d (umbral ${i.threshold}d).`,
      proposal: null,
      proposedBase: null,
    }
  }

  return {
    verdict: "verde",
    diagnosis: "Ritmo de reservas normal.",
    proposal: null,
    proposedBase: null,
  }
}

// ─── Aviso del watchdog (hallazgo 🟡 5 de la auditoría 23/08/2026) ─────────────────────────────
//
// El watchdog de esta cadena detectaba EXACTAMENTE lo que hay que saber —snapshot viejo, mercado
// de más de 7 días, calendario corto— y lo metía en un array que solo iba al console.warn: el
// único canal que nadie lee. Un watchdog mudo es peor que ninguno, porque su existencia hace
// creer que «si pasara algo, avisaría».

export type PisoRojo = { nombre: string; diagnosis: string }

/**
 * Aviso de Telegram del seguimiento del piloto. `null` si no hay nada que exija ojos —
 * el día normal NO genera mensaje: un vigía que da la lata a diario se silencia y deja de vigilar.
 *
 * Los avisos del watchdog van PRIMERO: «House está rojo» puede ser mentira si el snapshot con el
 * que se midió lleva tres días sin refrescarse, así que el lector tiene que ver antes de nada si
 * puede fiarse de la medición.
 */
export function avisoPilotTrack(rojos: PisoRojo[], watchdog: string[]): string | null {
  if (rojos.length === 0 && watchdog.length === 0) return null
  const partes: string[] = []
  if (watchdog.length > 0) {
    partes.push(
      `⚠️ *Vigía del piloto de precios: ${watchdog.length} aviso(s) de datos*\n` +
      watchdog.map(w => `• ${w}`).join('\n'),
    )
  }
  if (rojos.length > 0) {
    partes.push(
      `🔴 *${rojos.length} piso(s) en rojo* (solo propone, no toca precios)\n` +
      rojos.map(r => `• ${r.nombre}: ${r.diagnosis}`).join('\n'),
    )
  }
  return partes.join('\n\n')
}
