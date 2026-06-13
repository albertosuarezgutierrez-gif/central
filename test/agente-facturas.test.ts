import test from 'node:test'
import assert from 'node:assert/strict'
import { fingerprint, normalizaProveedor } from '../apps/sivra/lib/agente-facturas/fingerprint.ts'
import { evaluar, type Regla } from '../apps/sivra/lib/agente-facturas/reglas.ts'
import { conciliar, mapeaPropiedadAlquiler } from '../apps/sivra/lib/agente-facturas/conciliar.ts'
import { esPresupuesto } from '../apps/sivra/lib/agente-facturas/clasificar.ts'

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
test('detecta presupuesto/cotización y no lo confunde con factura', () => {
  // EST-006724.pdf — Codeoscopic PRESUPUESTO
  assert.equal(esPresupuesto('PRESUPUESTO # EST-006724 ... Fecha de la cotización', 'EST-006724.pdf'), true)
  // 26-07210.pdf — Codeoscopic FACTURA (mismo importe, NO es presupuesto)
  assert.equal(esPresupuesto('FACTURA N.º de factura 26-07210 ...', '26-07210.pdf'), false)
  // factura que menciona "según presupuesto" sigue siendo factura
  assert.equal(esPresupuesto('FACTURA por servicios según presupuesto previo', 'fra.pdf'), false)
})
