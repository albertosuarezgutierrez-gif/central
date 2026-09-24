import test from 'node:test'
import assert from 'node:assert/strict'

import { revisarCopy } from '@central/module-seguros'

import {
  TEXTO_CONSENTIMIENTO_COMERCIAL,
  TIPOS_CONSENTIMIENTO,
  TIPOS_QUE_SE_REGISTRAN,
  VERSION_TEXTO_COMERCIAL,
  consentimientoVigente,
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

test('se registran lds_art19 y comercial; `avisos` sigue sin casilla en ninguna pantalla', () => {
  // Guardián de una decisión, no de una implementación: escribir `avisos` sin
  // que la persona lo haya marcado es fabricar una prueba. `comercial` entró
  // el 19/09/2026 CON su casilla (`ConsentimientoComercial.tsx`).
  assert.deepEqual([...TIPOS_QUE_SE_REGISTRAN], ['lds_art19', 'comercial'])
})

test('el texto de la casilla comercial no promete precio ni acota ámbito, y tiene versión', () => {
  assert.deepEqual(revisarCopy(TEXTO_CONSENTIMIENTO_COMERCIAL), [])
  assert.match(VERSION_TEXTO_COMERCIAL, /^\d{4}-\d{2}-c\d+$/)
  // Dice qué autoriza y que se puede retirar: las dos cosas que exige el art. 7 RGPD.
  assert.match(TEXTO_CONSENTIMIENTO_COMERCIAL, /retirar/i)
  assert.match(TEXTO_CONSENTIMIENTO_COMERCIAL, /sin compromiso/i)
})

test('el consentimiento VIGENTE es la última fila, no «alguna otorgada»: retirar deja false', () => {
  const t = (iso: string) => new Date(iso)
  const filas = [
    { tipo: 'comercial', otorgado: true, versionTexto: '2026-09-c1', creadoEn: t('2026-09-01T10:00:00Z') },
    { tipo: 'comercial', otorgado: false, versionTexto: '2026-09-c1', creadoEn: t('2026-09-05T10:00:00Z') },
    { tipo: 'lds_art19', otorgado: true, versionTexto: '2026-09-v4', creadoEn: t('2026-09-09T10:00:00Z') },
  ]
  assert.equal(consentimientoVigente(filas, 'comercial'), false)
  // El orden de llegada no importa: manda la fecha.
  assert.equal(consentimientoVigente([...filas].reverse(), 'comercial'), false)
  assert.equal(consentimientoVigente(filas.slice(0, 1), 'comercial'), true)
})

test('una marca sobre el texto VIEJO no vale para el nuevo: con la versión actual distinta, null', () => {
  const filas = [{ tipo: 'comercial', otorgado: true, versionTexto: '2026-09-c0', creadoEn: new Date('2026-09-01T10:00:00Z') }]
  assert.equal(consentimientoVigente(filas, 'comercial', '2026-09-c1'), null)
  assert.equal(consentimientoVigente(filas, 'comercial', '2026-09-c0'), true)
  // Sin versión pedida se contesta por el valor, como antes.
  assert.equal(consentimientoVigente(filas, 'comercial'), true)
})

test('nunca preguntado es null, no false: la pantalla tiene que enseñar la casilla', () => {
  assert.equal(consentimientoVigente([], 'comercial'), null)
  assert.equal(
    consentimientoVigente([{ tipo: 'lds_art19', otorgado: true, versionTexto: 'v', creadoEn: new Date() }], 'comercial'),
    null,
  )
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
