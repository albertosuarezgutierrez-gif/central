import test from 'node:test'
import assert from 'node:assert/strict'
import { parsearJsonIa } from './parsear-json-ia.ts'

test('JSON limpio', () => {
  const r = parsearJsonIa('{"total": 121.0, "proveedor": "IONOS"}')
  assert.equal(r.ok, true)
  assert.equal(r.datos.total, 121)
})

test('envuelto en vallas de markdown', () => {
  const r = parsearJsonIa('```json\n{"total": 10.89}\n```')
  assert.equal(r.ok, true)
  assert.equal(r.datos.total, 10.89)
})

test('con prosa delante y detrás', () => {
  const r = parsearJsonIa('Aquí tienes el JSON:\n{"total": 42}\nEspero que te sirva.')
  assert.equal(r.ok, true)
  assert.equal(r.datos.total, 42)
})

test('llaves DENTRO de una cadena no cortan el objeto', () => {
  const r = parsearJsonIa('{"concepto": "Obra {piso 2}", "total": 5}')
  assert.equal(r.ok, true)
  assert.equal(r.datos.concepto, 'Obra {piso 2}')
  assert.equal(r.datos.total, 5)
})

test('comillas escapadas dentro del texto', () => {
  const r = parsearJsonIa('{"concepto": "Cambio de \\"llave\\" maestra", "total": 30}')
  assert.equal(r.ok, true)
  assert.equal(r.datos.total, 30)
})

// El caso real del 03/08: «Unterminated string in JSON at position 322».
test('respuesta truncada: NO se repara ni se inventa, se declara ilegible', () => {
  const r = parsearJsonIa('{"proveedor": "Punto y Coma", "total": 1234.5')
  assert.equal(r.ok, false)
  assert.deepEqual(r.datos, {})
})

test('respuesta vacía o sin JSON → ilegible, no «vacío»', () => {
  for (const raw of ['', null, undefined, 'No he podido leer la factura.']) {
    assert.equal(parsearJsonIa(raw).ok, false, `debería ser ilegible: ${String(raw)}`)
  }
})

test('un array NO es una factura', () => {
  assert.equal(parsearJsonIa('[{"total": 1}]').ok, false)
})

test('objeto vacío es legible (el modelo miró y no vio factura)', () => {
  const r = parsearJsonIa('{}')
  assert.equal(r.ok, true)
  assert.deepEqual(r.datos, {})
})
