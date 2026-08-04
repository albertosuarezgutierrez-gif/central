// ────────────────────────────────────────────────────────────────────────────
// COSTE DEL DINERO en una subasta. PURO.
//
// En una subasta no se compra como en el mercado libre: no hay «financiación
// sujeta a tasación». El art. 670 LEC da **40 días** desde la aprobación del
// remate para consignar la diferencia, y ningún banco formaliza una hipoteca
// en ese plazo sobre un inmueble que todavía no es tuyo. Quien no tiene el
// importe entero en caja necesita un PUENTE (préstamo personal, capital de un
// socio, línea de crédito), y ese dinero cuesta:
//
//   · La comisión de apertura se paga entera aunque el puente dure dos meses.
//   · Los intereses corren desde el desembolso hasta que la hipoteca definitiva
//     —ya con la finca inscrita a tu nombre— refinancia la operación.
//
// Ese coste no aparece en ninguna ficha y se come el margen de un flip ajustado:
// 60.000 € al 8% durante 4 meses son 1.600 € más la comisión. Se calcula aparte
// y se declara, en vez de esconderlo dentro del precio.
// ────────────────────────────────────────────────────────────────────────────

/** Plazo legal para consignar el resto del precio tras la aprobación (art. 670 LEC). */
export const DIAS_PARA_PAGAR = 40

/**
 * Meses que se asume que dura el puente si no se dice otra cosa: los ~40 días
 * hasta pagar, más el testimonio del decreto de adjudicación, la liquidación
 * del impuesto y la inscripción, que es cuando el banco puede hipotecar.
 */
export const MESES_PUENTE_ASUMIDOS = 4

export interface ParamsFinanciacion {
  /** Parte del desembolso que se cubre con dinero prestado (0-1). */
  pctFinanciado: number
  /** Tipo nominal ANUAL en tanto por uno. 0.08 = 8%. */
  tipoAnual: number
  /** Meses que dura el puente. Por defecto `MESES_PUENTE_ASUMIDOS`. */
  meses?: number
  /** Comisión de apertura en tanto por uno sobre el importe prestado. */
  comisionApertura?: number
}

export interface CosteFinanciacion {
  /** Importe efectivamente prestado. */
  principal: number
  intereses: number
  comision: number
  /** Intereses + comisión. Es lo que se suma al coste puerta abierta. */
  total: number
  meses: number
  nota: string
}

/**
 * Coste del puente para desembolsar `importe`.
 *
 * `importe` es el desembolso REAL que hay que poner encima de la mesa (coste
 * puerta abierta menos el depósito ya consignado, que también es dinero tuyo
 * pero ya está inmovilizado desde antes de pujar).
 */
export function costeFinanciacion(importe: number, p: ParamsFinanciacion): CosteFinanciacion {
  const meses = p.meses ?? MESES_PUENTE_ASUMIDOS
  const pct = Math.min(1, Math.max(0, p.pctFinanciado))
  const principal = redondear(Math.max(0, importe) * pct)

  if (principal <= 0 || meses <= 0) {
    return {
      principal: 0,
      intereses: 0,
      comision: 0,
      total: 0,
      meses,
      nota: 'Operación sin financiación: no se computa coste del dinero.',
    }
  }

  // Interés simple: un puente de pocos meses no se amortiza, se cancela entero.
  const intereses = redondear(principal * p.tipoAnual * (meses / 12))
  const comision = redondear(principal * (p.comisionApertura ?? 0))
  const total = redondear(intereses + comision)

  return {
    principal,
    intereses,
    comision,
    total,
    meses,
    nota:
      `Coste del dinero: ${formatearEur(principal)} prestados al ${formatearPct(p.tipoAnual)} durante ${meses} ` +
      `${meses === 1 ? 'mes' : 'meses'} = ${formatearEur(intereses)} de intereses` +
      (comision > 0 ? ` + ${formatearEur(comision)} de comisión de apertura` : '') +
      `. Recuerda que el art. 670 LEC solo da ${DIAS_PARA_PAGAR} días para consignar el resto del precio.`,
  }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

function formatearEur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

function formatearPct(x: number): string {
  return `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })}%`
}
