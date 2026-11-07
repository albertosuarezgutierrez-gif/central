import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegirCodigoAbrir, variantesAperturas, queryOrdenada, DP_UNLOCK } from './acceso-puro.ts'

test('elegirCodigoAbrir: elige el primer DP de apertura disponible, o null', () => {
  assert.equal(elegirCodigoAbrir(['foo', 'open_door']), 'open_door')
  assert.equal(elegirCodigoAbrir(['unlock_request', 'open_door']), 'unlock_request') // respeta el orden de preferencia
  assert.equal(elegirCodigoAbrir(['nada']), null)
})

test('queryOrdenada: ordena SIEMPRE las claves alfabéticamente (evita el 1004 sign invalid de Tuya)', () => {
  assert.equal(queryOrdenada({ pageNo: 1, pageSize: 20, startTime: 5, endTime: 9 }), 'endTime=9&pageNo=1&pageSize=20&startTime=5')
  assert.equal(queryOrdenada({ b: 'x', a: 'y' }), 'a=y&b=x')
})

test('variantesAperturas: la 1ª vía usa /records con los parámetros ORDENADOS y los DP de desbloqueo', () => {
  const vs = variantesAperturas('dev123', 1_000_000_000_000, 1000)
  assert.equal(vs[0].via, 'records+dps')
  assert.equal(vs[0].method, 'GET')
  // Orden alfabético: endTime, pageNo, pageSize, startTime, targetStandardDpCodes (si no, Tuya da 1004).
  assert.equal(
    vs[0].path,
    '/v1.0/devices/dev123/door-lock/records?endTime=1000000000000&pageNo=1&pageSize=20&startTime=999999999000&targetStandardDpCodes=' + DP_UNLOCK.join(','),
  )
})

test('variantesAperturas: incluye respaldo sin DP, el endpoint viejo y los logs de dispositivo, en orden', () => {
  const vias = variantesAperturas('d', 0).map(v => v.via)
  assert.deepEqual(vias, ['records+dps', 'records', 'open-logs', 'device-logs'])
})

test('variantesAperturas: la ventana por defecto son 90 días hacia atrás', () => {
  const ahora = 90 * 24 * 60 * 60 * 1000 // = ventana por defecto → startTime queda en 0
  const vs = variantesAperturas('d', ahora)
  assert.match(vs[0].path, /startTime=0(&|$)/)
  assert.match(vs[0].path, /endTime=7776000000/)
})

import { elegirMetodoAbrir, resumirRespuestaTuya, aperturaOk, esAperturaRemotaDesactivada } from './acceso-puro.ts'

test('elegirMetodoAbrir: remote_no_dp_key → password-free (no commands)', () => {
  assert.deepEqual(elegirMetodoAbrir(['battery_percentage', 'remote_no_dp_key'], null), { metodo: 'password-free' })
})
test('elegirMetodoAbrir: categoría smart lock (mk/ms/jtmspro) → password-free', () => {
  for (const c of ['mk', 'ms', 'jtmspro']) assert.deepEqual(elegirMetodoAbrir(['unlock_request'], c), { metodo: 'password-free' })
})
test('elegirMetodoAbrir: DP booleano real → commands', () => {
  assert.deepEqual(elegirMetodoAbrir(['switch', 'unlock_request'], 'wk'), { metodo: 'commands', code: 'unlock_request' })
  assert.deepEqual(elegirMetodoAbrir(['open_door'], undefined), { metodo: 'commands', code: 'open_door' })
  assert.equal(elegirMetodoAbrir(['switch_led'], 'dj'), null)
})
test('resumirRespuestaTuya / aperturaOk: result false o success false = no abierto; sin secretos', () => {
  assert.equal(aperturaOk(resumirRespuestaTuya('x', { success: true, result: true })), true)
  assert.equal(aperturaOk(resumirRespuestaTuya('x', { success: true, result: false })), false)
  assert.equal(aperturaOk(resumirRespuestaTuya('x', { success: false, code: 1109, msg: 'boom' })), false)
  assert.equal(resumirRespuestaTuya('x', { success: true, result: { ticket_key: 'SECRETO' } }).result, '[objeto]')
})
test('esAperturaRemotaDesactivada reconoce el mensaje de Tuya', () => {
  assert.equal(esAperturaRemotaDesactivada('remote unlock is not enabled'), true)
  assert.equal(esAperturaRemotaDesactivada('sign invalid'), false)
})
