// Lógica PURA del agente de seguimiento del piloto (sin DB ni red → testeable por inspección).
// El endpoint /api/pricing/pilot-track aporta los datos; aquí solo se decide el veredicto.

export type PilotInput = {
  freeNights60: number       // noches LIBRES en la ventana de 60 días
  bookedNights60: number     // noches reservadas en 60 días
  daysSinceBooking: number   // días desde la última reserva NUEVA creada
  threshold: number          // pilot_no_booking_days (def. 7)
  currentBase: number | null // precio base actual en Smoobu
  marketP50Guest: number | null // mediana del mercado (precio HUÉSPED)
  channelMarkup: number      // base → huésped (def. 1.16)
  minPrice: number | null    // suelo de coste (nunca bajar de aquí)
}

export type PilotVerdict = {
  verdict: "verde" | "amarillo" | "rojo"
  diagnosis: string
  proposal: string | null
  proposedBase: number | null
}

// Anti-falso-🔴 (#1): solo es 🔴 si hay fechas LIBRES y se superó el umbral sin reservas.
// Si no hay inventario libre (todo reservado), una racha sin reservas NUEVAS no es mala señal.
export function evaluatePilot(i: PilotInput): PilotVerdict {
  const guestPrice =
    i.currentBase != null ? Math.round(i.currentBase * i.channelMarkup) : null
  const overMarket =
    guestPrice != null && i.marketP50Guest != null && guestPrice > i.marketP50Guest

  if (i.freeNights60 === 0) {
    return {
      verdict: "verde",
      diagnosis: "Sin inventario libre en 60d (todo reservado).",
      proposal: null,
      proposedBase: null,
    }
  }

  if (i.daysSinceBooking >= i.threshold) {
    // Diagnóstico (#4): distinguir "estamos caros" de "no hay demanda en general".
    const diagnosis = overMarket
      ? `Sin reservas ${i.daysSinceBooking}d y por encima del mercado (huésped ${guestPrice}€ > p50 ${i.marketP50Guest}€).`
      : `Sin reservas ${i.daysSinceBooking}d pero NO estamos caros (huésped ${
          guestPrice ?? "?"
        }€ ≤ mercado). Probable demanda baja general en esas fechas.`

    // Propuesta (#6, solo PROPONE): bajar hacia el mercado, nunca por debajo del suelo de coste.
    let proposedBase: number | null = null
    if (overMarket && i.marketP50Guest != null) {
      const target = Math.round(i.marketP50Guest / i.channelMarkup)
      proposedBase = i.minPrice != null ? Math.max(target, i.minPrice) : target
    }
    const proposal =
      proposedBase != null && i.currentBase != null && proposedBase < i.currentBase
        ? `Bajar base ${i.currentBase}€ → ${proposedBase}€ (huésped ~${Math.round(
            proposedBase * i.channelMarkup,
          )}€).`
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
