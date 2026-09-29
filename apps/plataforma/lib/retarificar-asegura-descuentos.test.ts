import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerDescuentos } from './retarificar-asegura.ts'

test('leerDescuentos: tres estados, y un elemento ilegible no se pinta como lista completa', () => {
  assert.equal(leerDescuentos(undefined), null)
  assert.deepEqual(leerDescuentos([]), [])
  assert.deepEqual(leerDescuentos([{ etiqueta: 'CAP', pct: 25 }]), [{ etiqueta: 'CAP', pct: 25 }])
  assert.equal(leerDescuentos([{ etiqueta: 'CAP', pct: 25 }, { etiqueta: 'venta cruzada', pct: '25' }]), null)
  assert.equal(leerDescuentos([null]), null)
})
