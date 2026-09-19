import test from 'node:test'
import assert from 'node:assert/strict'
import { anadirJti, quitarJti, MAX_SESIONES } from './sesiones.ts'

// Lo que motivó esto (19/09/2026): un solo jti por cuenta → cada login expulsaba al resto de
// dispositivos. El móvil de Alberto pedía usuario "siempre" porque el PC lo echaba, y al revés.

test('un login nuevo NO expulsa a los anteriores', () => {
  assert.deepEqual(anadirJti(['pc'], 'movil'), ['pc', 'movil'])
})

test('el mismo jti no se duplica', () => {
  assert.deepEqual(anadirJti(['pc', 'movil'], 'pc'), ['movil', 'pc'])
})

test('al superar el máximo se cae el más antiguo, nunca el recién entrado', () => {
  const llenas = Array.from({ length: MAX_SESIONES }, (_, i) => `d${i}`)
  const tras = anadirJti(llenas, 'nuevo')
  assert.equal(tras.length, MAX_SESIONES)
  assert.equal(tras.at(-1), 'nuevo')
  assert.ok(!tras.includes('d0'))
  assert.ok(tras.includes('d1'))
})

test('logout quita SOLO su jti', () => {
  assert.deepEqual(quitarJti(['pc', 'movil'], 'pc'), ['movil'])
  assert.deepEqual(quitarJti(['pc'], 'no-existe'), ['pc'])
})
