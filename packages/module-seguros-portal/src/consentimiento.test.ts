import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TIPOS_CONSENTIMIENTO,
  TIPOS_QUE_SE_REGISTRAN,
  necesitaRegistro,
  normalizarIp,
  normalizarUserAgent,
  USER_AGENT_MAX,
} from './consentimiento.ts'

test('los tipos son exactamente los del CHECK de la tabla', () => {
  // Si aquí se añade uno que la BD no acepta, el INSERT revienta EN PRODUCCIÓN
  // y se lleva por delante el canje del código (van en la misma transacción).
  assert.deepEqual([...TIPOS_CONSENTIMIENTO], ['avisos', 'comercial', 'lds_art19'])
})

test('hoy SOLO se registra lds_art19: los otros dos no tienen casilla en ninguna pantalla', () => {
  // Guardián de una decisión, no de una implementación: escribir `avisos` o
  // `comercial` sin que la persona los haya marcado es fabricar una prueba.
  assert.deepEqual([...TIPOS_QUE_SE_REGISTRAN], ['lds_art19'])
})

test('sin filas previas hay que registrar', () => {
  assert.equal(necesitaRegistro([], 'lds_art19', '2026-09-v3'), true)
})

test('con la MISMA versión ya acreditada no se repite: entrar cien veces no deja cien filas', () => {
  const previas = [{ tipo: 'lds_art19', otorgado: true, versionTexto: '2026-09-v3' }]
  assert.equal(necesitaRegistro(previas, 'lds_art19', '2026-09-v3'), false)
})

test('si el texto cambia de versión, hace falta acreditar otra vez', () => {
  // Es la razón de ser de `version_texto`: una firma sobre el texto viejo no
  // acredita el nuevo.
  const previas = [{ tipo: 'lds_art19', otorgado: true, versionTexto: '2026-09-v2' }]
  assert.equal(necesitaRegistro(previas, 'lds_art19', '2026-09-v3'), true)
})

test('una fila con otorgado:false no acredita nada', () => {
  const previas = [{ tipo: 'lds_art19', otorgado: false, versionTexto: '2026-09-v3' }]
  assert.equal(necesitaRegistro(previas, 'lds_art19', '2026-09-v3'), true)
})

test('una fila de OTRO tipo no acredita este', () => {
  const previas = [{ tipo: 'comercial', otorgado: true, versionTexto: '2026-09-v3' }]
  assert.equal(necesitaRegistro(previas, 'lds_art19', '2026-09-v3'), true)
})

test('la IP sale de la PRIMERA entrada de X-Forwarded-For, que es el cliente', () => {
  assert.equal(normalizarIp('203.0.113.7, 70.41.3.18, 150.172.238.178'), '203.0.113.7')
  assert.equal(normalizarIp('  203.0.113.7  '), '203.0.113.7')
})

test('IPv6, con y sin corchetes y puerto', () => {
  assert.equal(normalizarIp('2001:db8::1'), '2001:db8::1')
  assert.equal(normalizarIp('[2001:db8::1]:443'), '2001:db8::1')
  assert.equal(normalizarIp('[::1]'), '::1')
})

test('a la IPv4 con puerto se le quita el puerto', () => {
  assert.equal(normalizarIp('1.2.3.4:5678'), '1.2.3.4')
})

test('lo que no sea una IP se va a null, NUNCA a la columna inet', () => {
  // La columna es `inet`: una cadena inválida hace fallar el INSERT y, al ir en
  // la transacción del canje, tumbaría el login. Y una IP inventada sería un
  // dato falso en un registro cuyo único valor es servir de prueba.
  for (const basura of [null, undefined, '', '   ', 'unknown', 'no-es-una-ip', '999.1.1.1', '1.2.3', '<script>']) {
    assert.equal(normalizarIp(basura), null, `debería ser null: ${String(basura)}`)
  }
})

test('el user agent se recorta y el vacío es null', () => {
  assert.equal(normalizarUserAgent(null), null)
  assert.equal(normalizarUserAgent('   '), null)
  assert.equal(normalizarUserAgent('Mozilla/5.0'), 'Mozilla/5.0')
  assert.equal(normalizarUserAgent('x'.repeat(1000))?.length, USER_AGENT_MAX)
})
