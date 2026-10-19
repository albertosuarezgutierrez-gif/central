import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asuntoRespuesta, cabecerasHilo, direccionSimple } from './correo-hilo.ts'

test('🪤 el hilo: In-Reply-To = su Message-ID y References = sus referencias + ese id', () => {
  const h = cabecerasHilo({ messageId: '<b@x.es>', references: ['<a@x.es>'] })
  assert.deepEqual(h, { inReplyTo: '<b@x.es>', references: ['<a@x.es>', '<b@x.es>'] })
})

test('🪤 inyección de cabeceras: un CR/LF o algo sin forma de Message-ID no pasa', () => {
  assert.equal(cabecerasHilo({ messageId: '<b@x.es>\r\nBcc: <otro@malo.es>', references: [] }), null)
  assert.equal(cabecerasHilo({ messageId: 'b@x.es', references: [] }), null)
  const h = cabecerasHilo({ messageId: '<b@x.es>', references: ['<a@x.es>\nBcc: <z@z.es>', 'basura', '<c@x.es>'] })
  assert.deepEqual(h?.references, ['<c@x.es>', '<b@x.es>'])
})

test('References largas: se conserva la raíz y las últimas', () => {
  const refs = Array.from({ length: 30 }, (_, i) => `<r${i}@x.es>`)
  const h = cabecerasHilo({ messageId: '<fin@x.es>', references: refs })!
  assert.equal(h.references.length, 20)
  assert.equal(h.references[0], '<r0@x.es>')
  assert.equal(h.references.at(-1), '<fin@x.es>')
})

test('asunto «Re:» sin duplicar ni saltos de línea', () => {
  assert.equal(asuntoRespuesta('Seguro de casa'), 'Re: Seguro de casa')
  assert.equal(asuntoRespuesta('RE: Seguro'), 'RE: Seguro')
  assert.equal(asuntoRespuesta('a\r\nBcc: x@y.es'), 'Re: a Bcc: x@y.es')
})

test('BCC: una sola dirección simple', () => {
  assert.equal(direccionSimple('Hola@GrupoAsegura.es'), 'hola@grupoasegura.es')
  assert.equal(direccionSimple('a@b.es, c@d.es'), null)
  assert.equal(direccionSimple('"X" <a@b.es>'), null)
})
