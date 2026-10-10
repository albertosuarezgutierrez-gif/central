import test from 'node:test'
import assert from 'node:assert/strict'
import { KM_ANUALES_SUPUESTOS } from '@central/module-seguros'
import { kmDeclaradoDeGuardada, kmEsDeclarado, kmParaCotizar } from './km-auto.ts'

const D = 10000
const base = { porDefecto: D, delRiesgo: false, tocado: false }

test('los 10.000 de partida, sin tocar, viajan como SUPUESTO y no se anotan en el riesgo', () => {
  const k = kmParaCotizar({ ...base, texto: '10000' })
  assert.deepEqual(k, { correccion: null, supuesto: 10000, paraRiesgo: null })
  assert.equal(kmEsDeclarado({ ...base, texto: '10000' }), false)
})

test('una cifra distinta tecleada es dato del cliente: corrección y riesgo', () => {
  assert.deepEqual(kmParaCotizar({ ...base, texto: '7.500' }), { correccion: 7500, supuesto: null, paraRiesgo: 7500 })
})

test('10.000 dichos de verdad (campo tocado) también son dato', () => {
  assert.deepEqual(kmParaCotizar({ ...base, texto: '10000', tocado: true }), { correccion: 10000, supuesto: null, paraRiesgo: 10000 })
})

test('los km que trae el riesgo son dato aunque coincidan con el defecto', () => {
  assert.deepEqual(kmParaCotizar({ ...base, texto: '10000', delRiesgo: true }), { correccion: 10000, supuesto: null, paraRiesgo: 10000 })
})

test('vacío o ilegible: no viaja nada (asegura supone la media y la marca)', () => {
  assert.deepEqual(kmParaCotizar({ ...base, texto: '' }), { correccion: null, supuesto: null, paraRiesgo: null })
  assert.deepEqual(kmParaCotizar({ ...base, texto: 'mucho', tocado: true }), { correccion: null, supuesto: null, paraRiesgo: null })
})

test('de una tarificación guardada, la media y el defecto NO se precargan como dato', () => {
  assert.equal(kmDeclaradoDeGuardada(null, D), null)
  assert.equal(kmDeclaradoDeGuardada(KM_ANUALES_SUPUESTOS, D), null)
  assert.equal(kmDeclaradoDeGuardada(D, D), null)
  assert.equal(kmDeclaradoDeGuardada(8000, D), 8000)
  assert.equal(kmDeclaradoDeGuardada(0, D), 0, 'un 0 es un valor, no «sin dato»')
})
