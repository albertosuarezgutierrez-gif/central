import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPeticionResend } from './recaptacion-email.ts'

test('la petición a Resend pide tracking de apertura y de clic', () => {
  const p = construirPeticionResend({
    apiKey: 'x', from: 'hola@envios.grupoasegura.es', to: 'cliente@example.com',
    asunto: 'Asunto', texto: 'Cuerpo', html: '<p>Cuerpo</p>',
  })
  assert.equal(p.url, 'https://api.resend.com/emails')
  assert.equal(p.body.to, 'cliente@example.com')
  assert.deepEqual(p.body.tags, [{ name: 'categoria', value: 'recaptacion' }])
})
