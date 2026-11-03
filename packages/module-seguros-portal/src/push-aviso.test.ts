import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tagPushCima, tagPushObligacion, accionesPushCima } from './push-aviso.ts'
import type { EventoCima } from './avisos-cima.ts'

const ev = (polizaId: string, tipo: EventoCima['tipo'] = 'recibo_devuelto', url?: string): EventoCima => ({
  clave: `${polizaId}:${tipo}`, tipo, polizaId, lista: 'recibos', fecha: null, texto: 't', url,
})

test('tag: misma póliza = cima-poliza-<id>; varias o ninguna = sin tag', () => {
  assert.equal(tagPushCima([ev('p1'), ev('p1', 'recibo_devuelto')]), 'cima-poliza-p1')
  assert.equal(tagPushCima([ev('p1'), ev('p2')]), undefined)
  assert.equal(tagPushCima([]), undefined)
})

test('tag de obligación', () => {
  assert.equal(tagPushObligacion({ polizaId: 'p1', polizaDeclaradaId: null }), 'oblig-poliza-p1')
  assert.equal(tagPushObligacion({ polizaId: null, polizaDeclaradaId: 'd1' }), 'oblig-anadida-d1')
  assert.equal(tagPushObligacion({ polizaId: null, polizaDeclaradaId: null }), undefined)
})

test('acciones: solo con recibo devuelto, a su ancla', () => {
  const a = accionesPushCima([ev('p1', 'recibo_devuelto', '/boveda/poliza/p1#recibo-x')])
  assert.deepEqual(a, [{ action: 'ver', title: 'Ver recibo', url: '/boveda/poliza/p1#recibo-x' }])
  assert.deepEqual(accionesPushCima([ev('p1', 'recibo_devuelto')]), [])
  assert.deepEqual(accionesPushCima([ev('p1', 'siniestro_nuevo' as EventoCima['tipo'], '/boveda/poliza/p1#siniestro-s')]), [])
  assert.deepEqual(accionesPushCima([]), [])
})
