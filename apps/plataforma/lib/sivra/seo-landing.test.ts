// Tests de decodeLanding (parseo de la respuesta de GitHub Contents API). Runner: `node --test`
// (type-stripping). Reproduce el bug que petaba el agente SEO de housesevillana: cuando GitHub
// NO devolvía un fichero (token ausente/inválido → 401 sin `content`), el código hacía
// `Buffer.from(undefined)` y lanzaba el críptico `ERR_INVALID_ARG_TYPE`. Ahora debe lanzar un
// error CLARO que menciona GITHUB_TOKEN, y decodificar bien una respuesta válida.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decodeLanding, extractSeoParams, applySeoReplacements, clasificarSondeo } from './seo-landing.ts'

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

// ── Sondeo de permisos de escritura (clasificarSondeo) ────────────────────────────────
// Bug que fijan (17/08/2026): tras unificar la landing en el monorepo, el PAT seguía scoped al
// antiguo repo externo. El GET no delataba nada (el repo `central` es público) y el 403 solo
// aparecía en el PUT, al final del análisis o el lunes en el cron. El sondeo lo dice en 1 s.
// 🚨 Lo que estos tests protegen de verdad: que SOLO el 409 se pinte de verde.

test('409 (conflicto de sha) → verde: GitHub llegó a validar el sha, luego el permiso está', () => {
  const s = clasificarSondeo(409, '{"message":"does not match"}')
  assert.equal(s.estado, 'puede-escribir')
  assert.equal(s.status, 409)
  assert.match(s.mensaje, /No se ha escrito nada/)
})

test('403 → sin permiso, con el arreglo concreto en el mensaje', () => {
  const s = clasificarSondeo(403, '{"message":"Resource not accessible by personal access token"}')
  assert.equal(s.estado, 'sin-permiso')
  assert.match(s.mensaje, /contents:write/)
  assert.match(s.mensaje, /central/)
  // El arreglo barato: editar permisos no cambia el valor del token.
  assert.match(s.mensaje, /NO cambia el valor del token/)
})

test('401 → token inválido/caducado, NO se confunde con falta de permiso', () => {
  const s = clasificarSondeo(401, '{"message":"Bad credentials"}')
  assert.equal(s.estado, 'token-invalido')
})

test('404 → desconocido y apunta a la RUTA, no al permiso (el repo es público)', () => {
  const s = clasificarSondeo(404, '{"message":"Not Found"}')
  assert.equal(s.estado, 'desconocido')
  assert.match(s.mensaje, /route\.ts/)
})

test('respuestas inesperadas NUNCA se pintan de verde (ni un 200)', () => {
  for (const status of [200, 201, 422, 429, 500, 502]) {
    const s = clasificarSondeo(status, 'lo que sea')
    assert.equal(s.estado, 'desconocido', `status ${status} no debe dar por bueno el token`)
    assert.notEqual(s.estado, 'puede-escribir')
  }
})
