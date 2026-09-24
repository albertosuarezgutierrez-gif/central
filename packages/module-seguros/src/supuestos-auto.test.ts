import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KM_ANUALES_SUPUESTOS,
  KM_ANUALES_MAXIMO,
  kilometrosDesdeTexto,
  supuestosVigentes,
} from './supuestos-auto.ts'

// 🪤 Cepo de VALOR, no de forma. Los kilómetros al año son factor de tarifa de
// primer orden y viajan en toda cotización de auto que no los declare: subirlos
// o bajarlos mueve el precio de cada presupuesto sin que ninguna pantalla lo
// diga. Que el número esté clavado en un test obliga a que el cambio sea un
// acto deliberado y revisado, no un retoque de paso.
test('el supuesto de kilómetros al año es 15.000 y no cambia por descuido', () => {
  assert.equal(KM_ANUALES_SUPUESTOS, 15000)
})

test('es un entero positivo: el vendor lo rechaza si no', () => {
  assert.ok(Number.isInteger(KM_ANUALES_SUPUESTOS))
  assert.ok(KM_ANUALES_SUPUESTOS > 0)
})

// ── El tecleo español de los kilómetros ─────────────────────────────────────
// 🪤 El brazo que importa es el de «15.000». `Number('15.000')` es 15, y ese
// 15 pasaba la pantalla, pasaba `revisarDatosAuto` y lo tarificaba el vendor
// por 0,50€: un error de tecleo con forma de precio bueno.

test('«15.000» son quince mil kilómetros, no quince', () => {
  assert.equal(kilometrosDesdeTexto('15.000'), 15000)
  assert.equal(kilometrosDesdeTexto('15000'), 15000)
  assert.equal(kilometrosDesdeTexto(' 8.000 '), 8000)
  assert.equal(kilometrosDesdeTexto('1.234.567'), 1234567)
})

test('lo que no es un kilometraje se rechaza en vez de interpretarse', () => {
  for (const malo of ['1.5', '12.34.5', '15,5', '15,000', 'abc', '1e5', '-100', '0', '', '   ', '10000000']) {
    assert.equal(kilometrosDesdeTexto(malo), null, `«${malo}» no es un kilometraje`)
  }
})

test('el tope es el del vendor, no uno inventado', () => {
  assert.equal(kilometrosDesdeTexto(String(KM_ANUALES_MAXIMO)), KM_ANUALES_MAXIMO)
  assert.equal(kilometrosDesdeTexto(String(KM_ANUALES_MAXIMO + 1)), null)
})

// ── Un supuesto corregido deja de ser un supuesto ───────────────────────────

test('el campo corregido sale de la lista de supuestos', () => {
  const supuestos = [{ campo: 'kmAnuales' }, { campo: 'garaje' }]
  assert.deepEqual(supuestosVigentes(supuestos, { kmAnuales: 8000 }), [{ campo: 'garaje' }])
})

test('lo que no se ha corregido SIGUE siendo supuesto, y se dice', () => {
  const supuestos = [{ campo: 'kmAnuales' }, { campo: 'garaje' }]
  assert.deepEqual(supuestosVigentes(supuestos, {}), supuestos)
  assert.deepEqual(supuestosVigentes(supuestos, undefined), supuestos)
  // Un hueco no es una corrección: `''`, `null` y `undefined` no tapan nada.
  assert.deepEqual(supuestosVigentes(supuestos, { kmAnuales: '', garaje: null }), supuestos)
})

test('`false` SÍ es una corrección: es lo que dice un interruptor apagado', () => {
  assert.deepEqual(supuestosVigentes([{ campo: 'remolqueLigero' }], { remolqueLigero: false }), [])
})
