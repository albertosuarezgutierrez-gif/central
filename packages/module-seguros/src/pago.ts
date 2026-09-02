// Forma de pago de una póliza y lo que cuesta fraccionarla.
//
// ─── Lo que dictó Alberto (02/09/2026) ──────────────────────────────────────
// «La póliza realmente solo se puede anular en vencimiento: son contratos
// anuales, y las compañías te FINANCIAN el pago (forma de pago) cobrando un
// interés. Esto lo tenemos que tener contemplado en la ficha de las pólizas.»
//
// ─── Lo que CIMA da y lo que NO (medido sobre las 109 vivas) ────────────────
//   `polizas.fraccionamiento`  → 108 de 109 (89 anual · 14 semestral · 5 trimestral)
//   `poliza_recibos.forma_pago` → CC (domiciliado) · OF (oficina) · TA (tarjeta)
//   el RECARGO por fraccionar   → 🚫 NO viene como dato. Se DERIVA: la suma de
//                                los recibos del ciclo menos la prima anual.
//
// Y por eso el recargo tiene TRES estados, no un número: si faltan recibos del
// ciclo (la compañía manda 2 de 4), la resta daría un recargo NEGATIVO
// plausible y falso. Solo se afirma con el ciclo completo.

export const FRACCIONES: Record<string, number> = {
  anual: 1,
  semestral: 2,
  trimestral: 4,
  mensual: 12,
}

const ETIQUETAS: Record<string, string> = {
  anual: 'anual',
  semestral: 'semestral',
  trimestral: 'trimestral',
  mensual: 'mensual',
}

export function etiquetaFraccionamiento(f: string | null): string {
  if (f === null) return 'no informado'
  return ETIQUETAS[f] ?? f.replace(/_/g, ' ')
}

const FORMAS_PAGO: Record<string, string> = {
  CC: 'domiciliado',
  OF: 'en oficina',
  TA: 'tarjeta',
}

/** El código EIAC de la forma de cobro del recibo. `null` = no informado. */
export function etiquetaFormaPago(codigo: string | null): string | null {
  if (codigo === null) return null
  return FORMAS_PAGO[codigo.toUpperCase()] ?? codigo
}

export type ReciboCiclo = {
  importe: number | null
  fechaEmision: string | null
  situacion: string | null
}

export type RecargoFraccionamiento =
  /** Pago anual: no hay nada que financiar. */
  | { estado: 'no_aplica' }
  /** No se puede afirmar: sin prima anual, sin recibos, o ciclo incompleto. */
  | { estado: 'sin_datos'; motivo: string }
  | {
      estado: 'calculado'
      primaAnual: number
      sumaRecibos: number
      recargoEur: number
      /** Sobre la prima anual. */
      recargoPct: number
      recibos: number
    }

function dentroDelCiclo(fecha: string | null, vencimiento: string | null): boolean {
  if (fecha === null || vencimiento === null) return false
  const f = new Date(`${fecha}T00:00:00Z`)
  const v = new Date(`${vencimiento}T00:00:00Z`)
  if (Number.isNaN(f.getTime()) || Number.isNaN(v.getTime())) return false
  const inicio = new Date(v)
  inicio.setUTCFullYear(inicio.getUTCFullYear() - 1)
  return f >= inicio && f < v
}

/**
 * Cuánto cuesta fraccionar ESTA anualidad. Solo se calcula con el ciclo
 * COMPLETO (tantos recibos no anulados como fracciones): con la mitad de los
 * recibos la resta sale negativa y parecería que fraccionar AHORRA.
 */
export function recargoFraccionamiento(args: {
  fraccionamiento: string | null
  primaAnual: number | null
  vencimiento: string | null
  recibos: ReciboCiclo[]
}): RecargoFraccionamiento {
  const { fraccionamiento, primaAnual, vencimiento } = args
  if (fraccionamiento === null) return { estado: 'sin_datos', motivo: 'la compañía no informa la forma de pago' }
  const fracciones = FRACCIONES[fraccionamiento]
  if (fracciones === undefined) return { estado: 'sin_datos', motivo: `forma de pago «${fraccionamiento}» no reconocida` }
  if (fracciones === 1) return { estado: 'no_aplica' }
  if (primaAnual === null) return { estado: 'sin_datos', motivo: 'la compañía no informa la prima anual' }
  if (vencimiento === null) return { estado: 'sin_datos', motivo: 'sin vencimiento no se sabe qué recibos son de este ciclo' }

  const delCiclo = args.recibos.filter(
    (r) => r.situacion !== 'anulado' && r.importe !== null && dentroDelCiclo(r.fechaEmision, vencimiento),
  )
  if (delCiclo.length < fracciones) {
    return {
      estado: 'sin_datos',
      motivo: `ciclo incompleto: ${delCiclo.length} de ${fracciones} recibos informados`,
    }
  }
  const suma = delCiclo.reduce((s, r) => s + (r.importe as number), 0)
  const recargo = Math.round((suma - primaAnual) * 100) / 100
  if (recargo < 0) {
    // La prima anual ya lleva el recargo, o los recibos no son de este ciclo.
    return { estado: 'sin_datos', motivo: 'los recibos suman menos que la prima anual: no cuadra' }
  }
  return {
    estado: 'calculado',
    primaAnual,
    sumaRecibos: Math.round(suma * 100) / 100,
    recargoEur: recargo,
    recargoPct: Math.round((recargo / primaAnual) * 10000) / 100,
    recibos: delCiclo.length,
  }
}

/**
 * Cuándo se puede dejar la póliza. Los contratos son ANUALES (LCS art. 22):
 * la única salida es el vencimiento, avisando con 30 días. Antes de eso,
 * cambiar de compañía no libera de pagar el resto del ciclo.
 */
export function ventanaAnulacion(
  vencimiento: string | null,
  hoy: Date = new Date(),
): { vencimiento: string; limiteAviso: string; diasParaAvisar: number; enPlazo: boolean } | null {
  if (vencimiento === null) return null
  const v = new Date(`${vencimiento}T00:00:00Z`)
  if (Number.isNaN(v.getTime())) return null
  const limite = new Date(v)
  limite.setUTCDate(limite.getUTCDate() - 30)
  const h = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
  const dias = Math.round((limite.getTime() - h.getTime()) / 86_400_000)
  return {
    vencimiento,
    limiteAviso: limite.toISOString().slice(0, 10),
    diasParaAvisar: dias,
    enPlazo: dias >= 0,
  }
}
