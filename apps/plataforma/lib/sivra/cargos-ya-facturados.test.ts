import { test } from 'node:test'
import assert from 'node:assert/strict'
import { idGastoDeRef, sumarCargosSinFactura, type CargoPiso } from './cargos-ya-facturados.ts'

const G = 'c1d91af2-fce8-4987-a050-b29801a3c601'
const PISO = 'prop_house_sevillana'
const cargo = (o: Partial<CargoPiso>): CargoPiso => ({
  propiedad_id: PISO, importe: 1749, factura_ref: null, gasto_existe: false, ...o,
})

test('gasto + movimiento enlazados: el cargo no se vuelve a sumar (cuenta una vez)', () => {
  const m = sumarCargosSinFactura([cargo({ factura_ref: `gasto:${G}`, gasto_existe: true })])
  assert.equal(m.get(PISO) ?? 0, 0)
})

test('el enlace del conciliador (sivra:gasto:) también cuenta como enlace', () => {
  const m = sumarCargosSinFactura([cargo({ factura_ref: `sivra:gasto:${G}`, gasto_existe: true })])
  assert.equal(m.get(PISO) ?? 0, 0)
})

test('movimiento sin gasto: cuenta', () => {
  const m = sumarCargosSinFactura([cargo({ importe: -1749 })])
  assert.equal(m.get(PISO), 1749)
})

test('gasto sin movimiento: el lado de cargos no aporta nada', () => {
  assert.equal(sumarCargosSinFactura([]).size, 0)
})

test('enlace roto (el gasto no existe) o ref que no es de gasto: el cargo cuenta', () => {
  const m = sumarCargosSinFactura([
    cargo({ importe: 100, factura_ref: `gasto:${G}`, gasto_existe: false }),
    cargo({ importe: 50, factura_ref: 'https://drive.google.com/file/d/abc/view', gasto_existe: true }),
  ])
  assert.equal(m.get(PISO), 150)
})

test('suma por piso y mezcla enlazados con libres', () => {
  const m = sumarCargosSinFactura([
    cargo({ factura_ref: `gasto:${G}`, gasto_existe: true }),
    cargo({ importe: -20 }),
    cargo({ propiedad_id: 'prop_duplex_center', importe: -30 }),
  ])
  assert.equal(m.get(PISO), 20)
  assert.equal(m.get('prop_duplex_center'), 30)
})

test('idGastoDeRef', () => {
  assert.equal(idGastoDeRef(`gasto:${G}`), G)
  assert.equal(idGastoDeRef('gasto:no-es-uuid'), null)
  assert.equal(idGastoDeRef(null), null)
})
