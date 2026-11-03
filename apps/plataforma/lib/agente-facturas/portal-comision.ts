// Facturas de COMISIÓN de los portales de reservas (Booking.com B.V., Airbnb, Expedia, Vrbo).
// No son un gasto: el portal paga en NETO y el motor fiscal ya resta la comisión como
// `incomes.amount_gross − amount`. La factura es solo un justificante (se archiva en Drive).
// Caso fundacional (03/11/2026): Booking.com B.V. nº 1664465127, 312,35 €, «Cargo por servicio de
// los pagos, Reservas», propuesta como PLATAFORMAS / Gastos compartidos.
//
// Las suscripciones a software de pisos (Smoobu, PriceLabs…) SÍ son gasto: el proveedor no es el
// portal, así que ni se evalúan. Se exige el portal como EMISOR (proveedor), no como mención.
//
// Módulo PURO para poder testearlo con `node --test`.
export interface ExtraccionPortal {
  proveedor?: string | null
  concepto?: string | null
}

export const MOTIVO_COMISION_PORTAL = 'Factura de comisión de portal: justificante, la comisión ya va restada vía bruto−neto'

const RE_PORTAL_EMISOR = /\b(booking\.?com|airbnb|expedia|vrbo|homeaway)\b/i
const RE_COMISION_O_CARGO =
  /\bcomisi[oó]n(?:es)?\b|\bcommission\b|\bcargos?\s+por\s+servicios?\b|\bservicios?\s+de\s+(?:los\s+)?pagos?\b|\bpayment\s+(?:service|processing)\b|\bservice\s+fee\b|\bpor\s+reservas\b|\btarifa\s+de\s+servicio\b/i

export function esFacturaComisionPortal(e: ExtraccionPortal): boolean {
  if (!RE_PORTAL_EMISOR.test(e.proveedor ?? '')) return false
  return RE_COMISION_O_CARGO.test(e.concepto ?? '')
}
