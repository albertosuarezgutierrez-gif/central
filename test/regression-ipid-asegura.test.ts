// Cepos de las fichas IPID en plataforma: una respuesta a medias no se pinta.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { interpretarIpid } from '../apps/plataforma/lib/ipid-asegura.ts'

const f = { id: 'a', compania: 'Allianz', producto: 'Todo Riesgo', nombreFichero: 'ipid.pdf', sha256: 'x'.repeat(64), bytes: 1200, subidoPor: 'yo', createdAt: '2026-09-24' }

test('lee la lista buena', () => {
  const l = interpretarIpid(200, { estado: 'ok', ipid: [f] })
  assert.ok(l.estado === 'ok' && l.fichas.length === 1)
})

test('🪤 una ficha ilegible tumba la lista (no se pinta «falta el IPID» de una que está)', () => {
  assert.deepEqual(interpretarIpid(200, { estado: 'ok', ipid: [f, { ...f, sha256: '' }] }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('🪤 un fallo no es una lista vacía', () => {
  assert.equal(interpretarIpid(500, { estado: 'error', causa: 'conexion' }).estado, 'error')
  assert.equal(interpretarIpid(404, null).estado, 'no_desplegado')
  assert.equal(interpretarIpid(503, null).estado, 'sin_configurar')
})
