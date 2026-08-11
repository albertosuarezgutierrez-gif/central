// Tests de decodeLanding (parseo de la respuesta de GitHub Contents API). Runner: `node --test`
// (type-stripping). Reproduce el bug que petaba el agente SEO de housesevillana: cuando GitHub
// NO devolvía un fichero (token ausente/inválido → 401 sin `content`), el código hacía
// `Buffer.from(undefined)` y lanzaba el críptico `ERR_INVALID_ARG_TYPE`. Ahora debe lanzar un
// error CLARO que menciona GITHUB_TOKEN, y decodificar bien una respuesta válida.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decodeLanding, extractSeoParams, applySeoReplacements } from './seo-landing.ts'

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

// ── extract/apply contra los DOS estilos reales del app/route.ts de la landing ──
// Bug que fijan (03/08/2026): las regex solo entendían comillas escapadas (\") y el
// fichero real lleva comillas normales — el agente actualizaba SOLO el <title> en silencio.

// Recorte fiel del app/route.ts REAL (template literal con comillas normales).
const LANDING_PLANA = `<title>Casa Sevilla Centro 12 pax</title>
<meta name="description" content="290 m&sup2; en el casco hist&oacute;rico de Sevilla."/>
<meta property="og:title" content="Casa con Parking | House Sevillana"/>
<meta property="og:description" content="290 m&sup2; &middot; 6 dormitorios"/>
<script type="application/ld+json">{"@type":"LodgingBusiness"}</script>`

// Estilo antiguo: el mismo HTML con las comillas escapadas dentro del string.
const LANDING_ESCAPADA = LANDING_PLANA.replace(/"/g, '\\"')

test('extractSeoParams lee description/og con comillas NORMALES (fichero real)', () => {
  const p = extractSeoParams(LANDING_PLANA)
  assert.equal(p.title, 'Casa Sevilla Centro 12 pax')
  assert.equal(p.description, '290 m&sup2; en el casco hist&oacute;rico de Sevilla.')
  assert.equal(p.ogDescription, '290 m&sup2; &middot; 6 dormitorios')
})

test('extractSeoParams sigue leyendo el estilo antiguo con comillas escapadas', () => {
  const p = extractSeoParams(LANDING_ESCAPADA)
  assert.equal(p.description, '290 m&sup2; en el casco hist&oacute;rico de Sevilla.')
  assert.equal(p.ogDescription, '290 m&sup2; &middot; 6 dormitorios')
})

test('applySeoReplacements actualiza las 4 piezas con comillas NORMALES', () => {
  const out = applySeoReplacements(LANDING_PLANA, 'Titulo Nuevo', 'Desc nueva', 'OG nueva')
  assert.match(out, /<title>Titulo Nuevo<\/title>/)
  assert.match(out, /<meta name="description" content="Desc nueva"\/>/)
  assert.match(out, /<meta property="og:title" content="Titulo Nuevo"\/>/)
  assert.match(out, /<meta property="og:description" content="OG nueva"\/>/)
  // No introduce escapes espurios ni toca el JSON-LD.
  assert.ok(!out.includes('\\"description\\"'))
  assert.ok(out.includes('{"@type":"LodgingBusiness"}'))
})

test('applySeoReplacements conserva el estilo escapado cuando el fichero lo usa', () => {
  const out = applySeoReplacements(LANDING_ESCAPADA, 'Titulo Nuevo', 'Desc nueva', 'OG nueva')
  assert.ok(out.includes('<meta name=\\"description\\" content=\\"Desc nueva\\"'))
  assert.ok(out.includes('<meta property=\\"og:title\\" content=\\"Titulo Nuevo\\"'))
  assert.ok(out.includes('<meta property=\\"og:description\\" content=\\"OG nueva\\"'))
})

test('sin tag que casar, el resto de reemplazos no rompe (no-op)', () => {
  const out = applySeoReplacements('<title>x</title><p>sin metas</p>', 'T', 'D', 'O')
  assert.equal(out, '<title>T</title><p>sin metas</p>')
})
