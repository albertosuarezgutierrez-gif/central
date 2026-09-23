import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cartaNombramientoMediador, transicionCartaMediador } from './carta-mediador.ts'
import { MEDIADOR } from './mediador.ts'

const d = { tomador: 'María López', compania: 'Mapfre', numeroPoliza: '0732000113003', ramo: 'hogar', fechaCarta: '2026-09-23' }

test('🪤 la carta identifica póliza y mediador, y dice que el contrato NO cambia', () => {
  const t = cartaNombramientoMediador(d)!
  assert.match(t, /A la atención de Mapfre/)
  assert.match(t, /póliza nº 0732000113003 \(hogar\)/)
  assert.match(t, new RegExp(MEDIADOR.identidad.claveDgsfp.replace('/', '\\/')))
  assert.match(t, /no modifica el contrato: la prima, las garantías y las condiciones siguen siendo las mismas/)
  assert.match(t, /Firmado electrónicamente el 23\/09\/2026\.\nMaría López$/)
})

test('🪤 sin compañía o sin número no hay carta que firmar', () => {
  assert.equal(cartaNombramientoMediador({ ...d, compania: ' ' }), null)
  assert.equal(cartaNombramientoMediador({ ...d, numeroPoliza: null }), null)
  assert.equal(cartaNombramientoMediador({ ...d, tomador: '' }), null)
})

test('🪤 una compañía de relleno del volcado («(legacy)») no es una compañía: no hay carta', () => {
  assert.equal(cartaNombramientoMediador({ ...d, compania: '(legacy)' }), null)
  assert.equal(cartaNombramientoMediador({ ...d, compania: 'desconocida' }), null)
  assert.ok(cartaNombramientoMediador({ ...d, compania: 'Allianz' }))
})

test('🪤 sin firma no se envía; solo una enviada se acepta o rechaza; aceptada es final', () => {
  assert.equal(transicionCartaMediador('pendiente', 'enviada'), null)
  assert.equal(transicionCartaMediador('firmada', 'enviada'), 'enviada')
  assert.equal(transicionCartaMediador('firmada', 'aceptada'), null)
  assert.equal(transicionCartaMediador('enviada', 'aceptada'), 'aceptada')
  assert.equal(transicionCartaMediador('enviada', 'rechazada'), 'rechazada')
  assert.equal(transicionCartaMediador('aceptada', 'desistida'), null)
  assert.equal(transicionCartaMediador('pendiente', 'desistida'), 'desistida')
})
