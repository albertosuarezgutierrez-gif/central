import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerTrasCobro, MENSAJE_COBRADA_ILEGIBLE } from './tras-cobro.ts'

test('200 sin projectId: no lanza y dice «cobrada, reintenta sin pagar»', () => {
  const r = leerTrasCobro({ mainQuotes: [] })
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.mensaje.startsWith(MENSAJE_COBRADA_ILEGIBLE))
  assert.match(MENSAJE_COBRADA_ILEGIBLE, /COBRADA/)
  assert.match(MENSAJE_COBRADA_ILEGIBLE, /SIN pagar/)
})

test('respuesta válida se interpreta', () => {
  const r = leerTrasCobro({ id: 123, mainQuotes: [] })
  assert.ok(r.ok && r.cotizacion.projectId === '123')
})

test('un lector que lanza algo raro tampoco escapa', () => {
  const r = leerTrasCobro({}, () => {
    throw 'boom'
  })
  assert.equal(r.ok, false)
})
