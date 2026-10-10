import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarPedirPrecio, interpretarPeticiones } from './mejorar-precio.ts'

test('🪤 solo un 200 con fecha es «recibido»: un 401 o un corte NO', () => {
  assert.deepEqual(interpretarPedirPrecio(200, { estado: 'ok', pedidoEl: '2026-09-23', yaExistia: false }), { estado: 'ok', pedidoEl: '2026-09-23', yaExistia: false })
  assert.equal(interpretarPedirPrecio(401, { error: 'No autorizado' }).estado, 'error')
  assert.equal(interpretarPedirPrecio(503, null).estado, 'error')
  assert.equal(interpretarPedirPrecio(200, { estado: 'ok' }).estado, 'error')
})

test('los rechazos se dicen con su motivo', () => {
  assert.deepEqual(interpretarPedirPrecio(422, { estado: 'invalido', motivo: 'Dinos qué te importa más.' }), { estado: 'invalido', motivo: 'Dinos qué te importa más.' })
  assert.equal(interpretarPedirPrecio(409, { estado: 'fuera_de_ventana' }).estado, 'no_disponible')
  assert.equal(interpretarPedirPrecio(404, { estado: 'no_encontrada' }).estado, 'no_disponible')
})

test('🪤 peticiones: no poder leerlas (null) no es «no has pedido nada» ([])', () => {
  assert.equal(interpretarPeticiones(503, null), null)
  assert.equal(interpretarPeticiones(200, { estado: 'ok' }), null)
  assert.deepEqual(interpretarPeticiones(409, { estado: 'sin_ficha' }), [])
  assert.deepEqual(
    interpretarPeticiones(200, { estado: 'ok', peticiones: [{ polizaId: 'p1', pedidoEl: '2026-09-20' }, { polizaId: 'p2' }] }),
    [{ polizaId: 'p1', pedidoEl: '2026-09-20' }],
  )
})

import { MENSAJE_VARIAS_FICHAS } from './mensajes-ficha.ts'

test('🪤 varias fichas y «no está en vigor» tienen texto propio, no «No encontramos esta póliza»', () => {
  const varias = interpretarPedirPrecio(409, { estado: 'varias_fichas' })
  assert.deepEqual(varias, { estado: 'no_disponible', motivo: MENSAJE_VARIAS_FICHAS })
  const vigor = interpretarPedirPrecio(409, { estado: 'no_vigente' })
  assert.equal(vigor.estado, 'no_disponible')
  assert.match((vigor as { motivo: string }).motivo, /en vigor/)
  assert.doesNotMatch((vigor as { motivo: string }).motivo, /No encontramos/)
  const nf = interpretarPedirPrecio(404, { estado: 'no_encontrada' })
  assert.match((nf as { motivo: string }).motivo, /No encontramos/)
})
