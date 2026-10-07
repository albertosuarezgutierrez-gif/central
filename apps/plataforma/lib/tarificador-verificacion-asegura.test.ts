// Aviso de verificación humana (08/10/2026). `node --test`, puro.
// Para verlo en rojo: en `componerAvisoVerificacion` añade `${p.trabajoId}` al texto (o cualquier dato del cliente) o en
// `interpretarVerificaciones` devuelve `{estado:'ok', pendientes:[]}` ante un error del puerto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { componerAvisoVerificacion, interpretarVerificaciones } from './tarificador-verificacion-asegura.ts'

const ID = '0b6a3a43-6a3a-4a43-8a3a-0b6a3a436a3a'

test('un fallo del puerto NO es «no hay pendientes»', () => {
  for (const [s, j] of [[401, null], [404, null], [500, { estado: 'error', causa: 'x' }], [200, { estado: 'ok' }], [200, null]] as const) {
    assert.equal(interpretarVerificaciones(s, j).estado, 'error', `status ${s}`)
  }
  assert.equal(interpretarVerificaciones(200, { estado: 'sin_configurar' }).estado, 'sin_configurar')
})

test('lee los pendientes y cuenta las filas ilegibles (no desaparecen en silencio)', () => {
  const r = interpretarVerificaciones(200, { estado: 'ok', pendientes: [{ trabajoId: ID, compania: 'generali', ramo: 'comunidades' }, { trabajoId: 'no-uuid', compania: 'x' }, { trabajoId: ID }] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.pendientes, [{ trabajoId: ID, compania: 'generali', ramo: 'comunidades' }])
  assert.equal(r.ilegibles, 2)
})

test('el mensaje lleva compañía y ramo, y nada más (sin id de trabajo ni datos del cliente)', () => {
  const t = componerAvisoVerificacion({ trabajoId: ID, compania: 'generali', ramo: 'comunidades' })
  assert.equal(t, '🔐 Generali pide verificación (comunidades): el bot se ha parado. Entra en su portal, valida y pulsa Reintentar en «Presupuestos de compañías».')
  assert.ok(!t.includes(ID))
  assert.ok(componerAvisoVerificacion({ trabajoId: ID, compania: '<b>x', ramo: '' }).includes('&lt;b&gt;x'))
})
