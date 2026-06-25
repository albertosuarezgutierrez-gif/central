// Tests de decodeLanding (parseo de la respuesta de GitHub Contents API). Runner: `node --test`
// (type-stripping). Reproduce el bug que petaba el agente SEO de housesevillana: cuando GitHub
// NO devolvía un fichero (token ausente/inválido → 401 sin `content`), el código hacía
// `Buffer.from(undefined)` y lanzaba el críptico `ERR_INVALID_ARG_TYPE`. Ahora debe lanzar un
// error CLARO que menciona GITHUB_TOKEN, y decodificar bien una respuesta válida.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decodeLanding } from './seo-landing.ts'

test('respuesta de error de GitHub (sin content) → error claro, NO ERR_INVALID_ARG_TYPE', () => {
  assert.throws(
    () => decodeLanding(false, 401, { message: 'Bad credentials' }),
    (err: Error) => {
      // El bug original: TypeError [ERR_INVALID_ARG_TYPE] de Buffer.from(undefined).
      assert.ok(!('code' in err && (err as { code?: string }).code === 'ERR_INVALID_ARG_TYPE'), 'no debe ser el TypeError de Buffer')
      assert.match(err.message, /GITHUB_TOKEN/)
      assert.match(err.message, /401/)
      assert.match(err.message, /Bad credentials/)
      return true
    },
  )
})

test('body vacío (json no parseable) → error claro con el status', () => {
  assert.throws(
    () => decodeLanding(false, 403, {}),
    /No se pudo leer la landing desde GitHub \(403\)/,
  )
})

test('respuesta válida con content base64 → decodifica a utf-8 y devuelve sha', () => {
  const contenidoOriginal = '<title>House Sevillana</title>'
  const content = Buffer.from(contenidoOriginal, 'utf-8').toString('base64')
  const out = decodeLanding(true, 200, { content, sha: 'abc123' })
  assert.equal(out.content, contenidoOriginal)
  assert.equal(out.sha, 'abc123')
})
