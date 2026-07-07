import { test } from 'node:test'
import assert from 'node:assert'
import {
  firmaTuya, sha256Hex, elegirCodigo, normalizarDispositivo, fusionarDispositivos,
  DP_VENTILADOR, DP_VELOCIDAD, DP_LUZ,
} from './tuya.ts'

// Vector conocido: sha256('') es constante pública.
test('sha256Hex del cuerpo vacío', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('firmaTuya es determinista, hex mayúsculas, y cambia con el token', () => {
  const base = {
    clientId: 'cid123', secret: 'secreto', t: '1700000000000', nonce: 'n1',
    method: 'get', path: '/v1.0/token?grant_type=1',
  }
  const s1 = firmaTuya(base)
  const s2 = firmaTuya(base)
  assert.equal(s1, s2)
  assert.match(s1, /^[0-9A-F]{64}$/)
  const s3 = firmaTuya({ ...base, accessToken: 'tok' })
  assert.notEqual(s1, s3)
})

test('firmaTuya incluye el body en stringToSign', () => {
  const base = {
    clientId: 'cid', secret: 's', t: '1', nonce: 'n',
    method: 'POST', path: '/v1.0/devices/x/commands',
  }
  assert.notEqual(firmaTuya({ ...base, body: '{"a":1}' }), firmaTuya({ ...base, body: '{"a":2}' }))
})

test('elegirCodigo respeta el orden de candidatos y devuelve null si no hay', () => {
  assert.equal(elegirCodigo(['switch', 'fan_speed'], DP_VENTILADOR), 'switch')
  assert.equal(elegirCodigo(['switch_fan', 'switch'], DP_VENTILADOR), 'switch_fan')
  assert.equal(elegirCodigo(['fan_speed_percent'], DP_VELOCIDAD), 'fan_speed_percent')
  assert.equal(elegirCodigo(['switch_led'], DP_LUZ), 'switch_led')
  assert.equal(elegirCodigo(['bright_value'], DP_VENTILADOR), null)
})

// Los dos endpoints de listado devuelven la fila con nombres de campo distintos:
//  - /v1.0/iot-01/associated-users/devices (cuenta vinculada por QR): name / online (snake)
//  - /v2.0/cloud/thing/device (importados al proyecto): customName / isOnline (camel)
test('normalizarDispositivo mapea ambos formatos de endpoint', () => {
  assert.deepEqual(
    normalizarDispositivo({ id: 'x', name: 'Ventilador', online: true, category: 'fs' }),
    { id: 'x', name: 'Ventilador', online: true, category: 'fs' },
  )
  assert.deepEqual(
    normalizarDispositivo({ id: 'y', customName: 'Techo', name: 'raw', isOnline: false, category: 'kj' }),
    { id: 'y', name: 'Techo', online: false, category: 'kj' },
  )
  // customName vacío → cae a name; sin nombre → cadena vacía (no rompe el INSERT, usa el id).
  assert.equal(normalizarDispositivo({ id: 'z', customName: '', name: 'Real' }).name, 'Real')
})

test('fusionarDispositivos deduplica por id y conserva la primera lista', () => {
  const asociados = [{ id: '1', name: 'A', online: true, category: '' }]
  const proyecto = [
    { id: '1', name: 'A-dup', online: false, category: '' },
    { id: '2', name: 'B', online: true, category: '' },
  ]
  const out = fusionarDispositivos(asociados, proyecto)
  assert.deepEqual(out.map(d => d.id), ['1', '2'])
  assert.equal(out.find(d => d.id === '1')?.name, 'A') // gana el de la 1ª lista (asociados)
  assert.deepEqual(fusionarDispositivos([], []), [])
})
