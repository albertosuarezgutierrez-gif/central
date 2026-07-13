import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegirCodigoAbrir, variantesAperturas, DP_UNLOCK } from './acceso-puro.ts'

test('elegirCodigoAbrir: elige el primer DP de apertura disponible, o null', () => {
  assert.equal(elegirCodigoAbrir(['foo', 'open_door']), 'open_door')
  assert.equal(elegirCodigoAbrir(['unlock_request', 'open_door']), 'unlock_request') // respeta el orden de preferencia
  assert.equal(elegirCodigoAbrir(['nada']), null)
})

test('variantesAperturas: la 1ª vía usa /records con pageNo/pageSize/startTime/endTime y los DP de desbloqueo', () => {
  const vs = variantesAperturas('dev123', 1_000_000_000_000, 1000)
  assert.equal(vs[0].via, 'records+dps')
  assert.equal(vs[0].method, 'GET')
  assert.match(vs[0].path, /^\/v1\.0\/devices\/dev123\/door-lock\/records\?/)
  assert.match(vs[0].path, /pageNo=1&pageSize=20/)
  assert.match(vs[0].path, /startTime=999999999000&endTime=1000000000000/) // ahora - ventana
  assert.ok(vs[0].path.endsWith('targetStandardDpCodes=' + DP_UNLOCK.join(',')))
})

test('variantesAperturas: incluye respaldo sin DP, el endpoint viejo y los logs de dispositivo, en orden', () => {
  const vias = variantesAperturas('d', 0).map(v => v.via)
  assert.deepEqual(vias, ['records+dps', 'records', 'open-logs', 'device-logs'])
})

test('variantesAperturas: la ventana por defecto son 90 días hacia atrás', () => {
  const ahora = 90 * 24 * 60 * 60 * 1000 // = ventana por defecto → startTime queda en 0
  const vs = variantesAperturas('d', ahora)
  assert.match(vs[0].path, /startTime=0&endTime=7776000000/)
})
