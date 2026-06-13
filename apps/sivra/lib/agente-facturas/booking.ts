// Detección y parseo de facturas de Booking.com. Booking emite una factura por
// ESTABLECIMIENTO (piso) y mes → la huella se basa en el ID de establecimiento
// para que cada piso aprenda su propia regla. Módulo casi puro (solo regex).
import type { FacturaExtraida } from './extraer'

export function esBooking(texto: string, from = ''): boolean {
  const t = `${from} ${texto}`
  // Booking.com como emisor: su CIF holandés o el dominio en cuerpo/remitente.
  return /NL805734958B01/i.test(texto.replace(/[\s-]/g, '')) || /booking\.com/i.test(t)
}

function num(s: string | undefined | null): number | null {
  if (!s) return null
  return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}

export interface BookingParsed {
  establishmentId: string | null
  factura: FacturaExtraida
}

// Parsea el texto de una factura de Booking al formato común de gasto.
export function parseBooking(texto: string): BookingParsed {
  const m = (re: RegExp) => { const x = texto.match(re); return x ? x[1] : null }

  const establishmentId = m(/ID del (?:establecimiento|alojamiento)[:\s]+(\d+)/i)
  const numeroFactura = m(/N[úu]mero de factura[:\s]+(\d+)/i)
  const periodStart = m(/Per[ií]odo[:\s]+(\d{2}\/\d{2}\/\d{4})/i)
  const periodEnd = (() => {
    const x = texto.match(/Per[ií]odo[:\s]+\d{2}\/\d{2}\/\d{4}\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/i)
    return x ? x[1] : null
  })()

  // "Comisión Total EUR 393,93" → total a contabilizar.
  const total = num(m(/Comisi[oó]n Total\s+EUR\s+([\d.,]+)/i)) ?? num(m(/Importe total pendiente\s+EUR\s+([\d.,]+)/i))

  // "21% de IVA sobre EUR 325,56 EUR 68,37" → pct, base, iva. Si no hay (inversión
  // del sujeto pasivo), iva=0 y la base = total.
  const ivaMatch = texto.match(/(\d+)%\s+de\s+IVA\s+sobre\s+EUR\s+([\d.,]+)\s+EUR\s+([\d.,]+)/i)
  const ivaPct = ivaMatch ? parseInt(ivaMatch[1]) : 0
  const base = ivaMatch ? num(ivaMatch[2]) : total
  const iva = ivaMatch ? num(ivaMatch[3]) : 0

  let fecha: string | null = null
  if (periodEnd) { const [d, mo, y] = periodEnd.split('/'); fecha = `${y}-${mo}-${d}` }

  const concepto = `Comisión Booking.com${periodStart && periodEnd ? ` ${periodStart} – ${periodEnd}` : ''}`

  const factura: FacturaExtraida = {
    fecha,
    proveedor: 'Booking.com',
    nif_proveedor: 'NL805734958B01',
    numero_factura: numeroFactura,
    concepto,
    categoria: 'PLATAFORMAS',
    base_imponible: base,
    iva_porcentaje: ivaPct,
    iva,
    irpf: 0,
    irpf_porcentaje: 0,
    total,
  }
  return { establishmentId, factura }
}

// Huella estable por piso (mismo establecimiento = misma regla aprendida).
export function bookingFingerprint(establishmentId: string | null): string {
  return establishmentId ? `booking:${establishmentId}` : 'booking:desconocido'
}
