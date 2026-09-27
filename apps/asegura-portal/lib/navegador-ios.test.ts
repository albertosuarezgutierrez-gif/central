import assert from 'node:assert/strict'
import { test } from 'node:test'

import { navegadorIOS } from './navegador-ios.ts'

// User agents reales de iPhone: cada navegador esconde Compartir en otro sitio,
// y confundirlos manda al cliente a buscar un botón que no tiene.
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.46 Mobile/15E148 Safari/604.1'
const FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15'
const EDGE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/129.0.2792.84 Mobile/15E148 Safari/605.1.15'
const GOOGLE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/334.0.674067880 Mobile/15E148 Safari/604.1'

test('Safari de iPhone es safari (su Compartir va dentro de «···» desde iOS 26)', () => {
  assert.equal(navegadorIOS(SAFARI), 'safari')
})

test('Chrome de iPhone es chrome aunque su UA también diga Safari', () => {
  assert.equal(navegadorIOS(CHROME), 'chrome')
})

test('Firefox, Edge y la app de Google no son Safari aunque lo digan', () => {
  assert.equal(navegadorIOS(FIREFOX), 'otro')
  assert.equal(navegadorIOS(EDGE), 'otro')
  assert.equal(navegadorIOS(GOOGLE), 'otro')
})
