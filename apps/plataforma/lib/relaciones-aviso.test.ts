/**
 * El contrato del aviso por correo: cinco desenlaces que NO se pueden colapsar.
 *
 * Lo que este fichero protege es una frase, no un tipo: que «✅ Correo enviado»
 * solo pueda salir de un envío que ocurrió. El resto de desenlaces dicen
 * además, cada uno, que NO se ha enviado nada — porque lo primero que hace
 * Alberto al leerlos es decidir si escribe el correo a mano.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { interpretarAviso, textoAviso, type RespuestaAviso } from './relaciones-asegura.ts'

test('un 200 ok es enviado, y la fecha es un extra que no lo tumba', () => {
  const r = interpretarAviso(200, { estado: 'ok', caducaEn: '2027-03-14T00:00:00.000Z' })
  assert.equal(r.estado, 'ok')
  assert.ok(textoAviso(r, 'Pablo').startsWith('✅'))

  // Sin fecha legible el correo SALIÓ igual: convertirlo en error diría que no
  // se ha escrito uno que ya está enviado.
  for (const mala of [undefined, null, 'no-es-una-fecha', 42]) {
    const s = interpretarAviso(200, { estado: 'ok', caducaEn: mala })
    assert.equal(s.estado, 'ok', String(mala))
    assert.equal(s.estado === 'ok' && s.caducaEn, null)
  }
})

test('cada fallo llega con SU estado, no colapsado en un «no se pudo»', () => {
  const casos: [number, string][] = [
    [409, 'sin_pendiente'],
    [422, 'sin_email'],
    [503, 'sin_portal'],
    [502, 'error_envio'],
    [422, 'invalido'],
  ]
  for (const [status, estado] of casos) {
    const r = interpretarAviso(status, { estado, motivo: 'lo que sea' })
    assert.equal(r.estado, estado, `${status} ${estado}`)
  }
})

test('NINGUN fallo se puede leer como que el correo salio', () => {
  const fallos: RespuestaAviso[] = [
    { estado: 'sin_pendiente', motivo: 'x' },
    { estado: 'sin_email', motivo: 'x' },
    { estado: 'sin_portal', motivo: 'x' },
    { estado: 'error_envio', motivo: 'x' },
    { estado: 'invalido', motivo: 'x' },
    { estado: 'error', motivo: 'red' },
  ]
  for (const f of fallos) {
    const t = textoAviso(f, 'Pablo')
    assert.ok(!t.startsWith('✅'), `${f.estado}: ${t}`)
    assert.ok(!/correo enviado/i.test(t), `${f.estado} no puede decir «correo enviado»: ${t}`)
    // Y no basta con no afirmar el éxito: tiene que decir en voz alta que no ha
    // salido, que es lo que hace que Alberto lo escriba a mano.
    assert.match(t, /no se ha enviado|no le ha llegado/i, `${f.estado}: ${t}`)
  }
})

test('sin_email dice QUE hay que arreglar, que es lo unico accionable', () => {
  const t = textoAviso({ estado: 'sin_email', motivo: 'x' }, 'Pablo')
  assert.match(t, /correo/i)
  assert.match(t, /Pablo/)
  assert.match(t, /No se ha enviado nada/i)
})

test('un 401 no se confunde con «no hay nada pendiente»', () => {
  const r = interpretarAviso(401, null)
  assert.equal(r.estado, 'error')
  assert.equal(r.estado === 'error' && r.motivo, 'secreto_rechazado')
  assert.match(textoAviso(r, 'Pablo'), /ASEGURA_OPERADOR_SECRET/)
})

test('una respuesta sin forma no se lee como exito', () => {
  for (const json of [null, {}, { estado: 'ok' }, 'texto']) {
    const r = interpretarAviso(200, json)
    if (json !== null && typeof json === 'object' && 'estado' in json) continue
    assert.notEqual(r.estado, 'ok', JSON.stringify(json))
  }
  assert.equal(interpretarAviso(500, { causa: 'sin_conexion' }).estado, 'error')
})
