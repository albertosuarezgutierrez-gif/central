import test from 'node:test'
import assert from 'node:assert/strict'
import { importeEiac, sumarImportesEiac } from './importe-eiac.ts'

test('lee la forma que de verdad manda CIMA (medido: 184/184 recibos)', () => {
  assert.equal(importeEiac('431.85'), 431.85)
  assert.equal(importeEiac('1234.56'), 1234.56)
  assert.equal(importeEiac('0.00'), 0)
  assert.equal(importeEiac('-12.50'), -12.5)
  assert.equal(importeEiac(' 99.90 '), 99.9)
  assert.equal(importeEiac('1234'), 1234)
  assert.equal(importeEiac('99.9'), 99.9)
})

test('un cero de verdad NO es lo mismo que un hueco', () => {
  assert.equal(importeEiac('0.00'), 0)
  assert.equal(importeEiac(null), null)
  assert.equal(importeEiac(undefined), null)
  assert.equal(importeEiac(''), null)
  assert.equal(importeEiac('   '), null)
})

test('🚨 el formato español NO se adivina: sale null, no una cifra 1000x menor', () => {
  // Si esto devolviera 1.234 estaríamos diciendo «1,23€» donde pone 1.234,56€.
  assert.equal(importeEiac('1.234,56'), null)
  assert.equal(importeEiac('1.234'), null)
  assert.equal(importeEiac('431,85'), null)
})

test('nada que no sea un importe con la forma medida', () => {
  for (const basura of ['N/A', '--', 'sin dato', '12.345.678', '1e3', '12.345', '0x10', '+5.00']) {
    assert.equal(importeEiac(basura), null, `«${basura}» no debería leerse como número`)
  }
})

test('la suma dice cuántos no ha podido leer, en vez de contarlos como 0', () => {
  const r = sumarImportesEiac(['100.00', '200.50', 'N/A', null, '', '1.234,56'])
  assert.equal(r.total, 300.5)
  assert.equal(r.leidos, 2)
  // 'N/A' y '1.234,56' son ilegibles; null y '' son ausencias, que es otra cosa.
  assert.equal(r.ilegibles, 2)
})

test('los céntimos no se van en flotantes', () => {
  assert.equal(sumarImportesEiac(['0.10', '0.20']).total, 0.3)
  assert.equal(sumarImportesEiac(['870.45', '0.00']).total, 870.45)
})

test('lista vacía: total 0 con leidos 0 — quien pinta decide cómo decirlo', () => {
  assert.deepEqual(sumarImportesEiac([]), { total: 0, leidos: 0, ilegibles: 0 })
})
