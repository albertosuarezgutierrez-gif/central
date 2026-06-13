import test from 'node:test'
import assert from 'node:assert/strict'
import { fingerprint, normalizaProveedor, normalizaNif } from '../apps/sivra/lib/agente-facturas/fingerprint.ts'
import { evaluar, type Regla } from '../apps/sivra/lib/agente-facturas/reglas.ts'
import { conciliar, mapeaPropiedadAlquiler } from '../apps/sivra/lib/agente-facturas/conciliar.ts'
import { esPresupuesto } from '../apps/sivra/lib/agente-facturas/clasificar.ts'
import { esBooking, parseBooking, bookingFingerprint } from '../apps/sivra/lib/agente-facturas/booking.ts'

// ── fingerprint ──────────────────────────────────────────────────────────────
test('fingerprint alquiler distingue piso por dirección', () => {
  const fpD = fingerprint({ proveedor: 'GUTIERREZ ALCALA, MARIA', concepto: 'BAJO Derecha BUSTOS TAVERA 22 RENTA' })
  const fpI = fingerprint({ proveedor: 'GUTIERREZ ALCALA, MARIA', concepto: 'BAJO izquierda BUSTOS TAVERA 22 RENTA' })
  assert.notEqual(fpD, fpI)
  assert.match(fpD, /derecha/)
  assert.equal(fpD, 'gutierrez alcala maria:derecha')
  assert.equal(fpI, 'gutierrez alcala maria:izquierda')
})

test('fingerprint estable ante mayúsculas/acentos/espacios (vía NIF)', () => {
  const a = fingerprint({ nif_proveedor: 'B-12.345.678 ', proveedor: 'Endesa Energía S.A.' })
  const b = fingerprint({ nif_proveedor: 'b12345678', proveedor: 'ENDESA  ENERGIA SA' })
  assert.equal(a, b)
})

test('normalizaProveedor quita acentos y formas jurídicas', () => {
  assert.equal(normalizaProveedor('Endesa Energía, S.A.'), 'endesa energia')
  assert.equal(normalizaProveedor('ENDESA ENERGIA SA'), 'endesa energia')
})

test('normalizaNif quita el prefijo de país ES del CIF', () => {
  assert.equal(normalizaNif('ES A-81864498'), 'A81864498')
  assert.equal(normalizaNif('A85677342'), 'A85677342')
  assert.equal(normalizaNif('A-81864498'), 'A81864498')
})

// ── reglas / confianza ────────────────────────────────────────────────────────
const reglaAlquiler: Regla = {
  fingerprint: 'gutierrez alcala maria:derecha', propiedad: 'prop_luxury_busto',
  categoria: 'ALQUILER', iva_porcentaje: 21, irpf_porcentaje: 19,
  importe_esperado: 309.38, importe_min: 300, importe_max: 320, vistas: 2, activa: true,
}

test('regla estable + importe en banda → auto (alta confianza)', () => {
  const r = evaluar({ total: 309.38, base_imponible: 303.31, iva: 63.70, irpf: 57.63 }, reglaAlquiler)
  assert.equal(r.decision, 'auto')
  assert.ok(r.confianza >= 0.8)
  assert.equal(r.propiedad, 'prop_luxury_busto')
})

test('importe fuera de banda → bandeja', () => {
  const r = evaluar({ total: 450 }, reglaAlquiler)
  assert.equal(r.decision, 'bandeja')
  assert.match(r.motivo!, /importe/i)
})

test('sin regla → bandeja', () => {
  const r = evaluar({ total: 50 }, null)
  assert.equal(r.decision, 'bandeja')
})

test('regla nueva (vistas<2) → bandeja aunque coincida el importe', () => {
  const r = evaluar({ total: 309.38 }, { ...reglaAlquiler, vistas: 1 })
  assert.equal(r.decision, 'bandeja')
})

// ── conciliación / mapeo ──────────────────────────────────────────────────────
test('concilia base+IVA−IRPF=total (recibo Luxury)', () => {
  assert.equal(conciliar({ base_imponible: 303.31, iva: 63.70, irpf: 57.63, total: 309.38 }).ok, true)
})

test('concilia recibo Busto Reform', () => {
  assert.equal(conciliar({ base_imponible: 254.08, iva: 53.36, irpf: 48.28, total: 259.16 }).ok, true)
})

test('detecta descuadre', () => {
  assert.equal(conciliar({ base_imponible: 303.31, iva: 63.70, irpf: 57.63, total: 999 }).ok, false)
})

test('mapea Bajo Derecha→Luxury, Bajo Izquierda→Busto Reform', () => {
  assert.equal(mapeaPropiedadAlquiler('BAJO Derecha BUSTOS TAVERA 22'), 'prop_luxury_busto')
  assert.equal(mapeaPropiedadAlquiler('BAJO izquierda BUSTOS TAVERA 22'), 'prop_busto_reform')
  assert.equal(mapeaPropiedadAlquiler('otra cosa'), null)
})

// ── presupuesto vs factura (anti-duplicidad) ──────────────────────────────────
// ── Booking.com (una factura por establecimiento/piso) ────────────────────────
const BOOKING_IVA = `Individual entrepreneur HOUSE SEVILLANA
Booking.com B.V. NIF-IVA: NL805734958B01
ID del establecimiento: 4771238 Número de factura: 1615582147 Fecha: 03/09/2024 Período: 01/08/2024 - 31/08/2024
FACTURA
Cargo por pago EUR 6,18
Reservas EUR 561,90 EUR 84,29
21% de IVA sobre EUR 90,47 EUR 19,00
Comisión Total EUR 109,47`

const BOOKING_REVERSE = `Empresario individual Alberto Suarez
Booking.com B.V. NIF-IVA: NL805734958B01
ID del establecimiento: 2624604 Número de factura: 1609015629 Fecha: 03/05/2024 Período: 01/04/2024 - 30/04/2024
FACTURA
Reservas EUR 3.744,33 EUR 636,54
Cargo por pago EUR 41,21
Comisión Total EUR 677,75
* IVA con mecanismo de 'inversión del sujeto pasivo'`

test('esBooking detecta facturas de Booking', () => {
  assert.equal(esBooking(BOOKING_IVA), true)
  assert.equal(esBooking('Factura de la ferretería'), false)
})

test('parseBooking con IVA (House Sevillana)', () => {
  const { establishmentId, factura } = parseBooking(BOOKING_IVA)
  assert.equal(establishmentId, '4771238')
  assert.equal(factura.total, 109.47)
  assert.equal(factura.base_imponible, 90.47)
  assert.equal(factura.iva, 19.00)
  assert.equal(factura.iva_porcentaje, 21)
  assert.equal(factura.fecha, '2024-08-31')
  assert.equal(factura.categoria, 'PLATAFORMAS')
  assert.equal(factura.proveedor, 'Booking.com')
  assert.equal(bookingFingerprint(establishmentId), 'booking:4771238')
})

test('parseBooking con inversión del sujeto pasivo (sin IVA)', () => {
  const { establishmentId, factura } = parseBooking(BOOKING_REVERSE)
  assert.equal(establishmentId, '2624604')
  assert.equal(factura.total, 677.75)
  assert.equal(factura.iva, 0)
  assert.equal(factura.iva_porcentaje, 0)
})

test('detecta presupuesto/cotización y no lo confunde con factura', () => {
  // EST-006724.pdf — Codeoscopic PRESUPUESTO
  assert.equal(esPresupuesto('PRESUPUESTO # EST-006724 ... Fecha de la cotización', 'EST-006724.pdf'), true)
  // 26-07210.pdf — Codeoscopic FACTURA (mismo importe, NO es presupuesto)
  assert.equal(esPresupuesto('FACTURA N.º de factura 26-07210 ...', '26-07210.pdf'), false)
  // factura que menciona "según presupuesto" sigue siendo factura
  assert.equal(esPresupuesto('FACTURA por servicios según presupuesto previo', 'fra.pdf'), false)
})
