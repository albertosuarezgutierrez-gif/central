import { test } from 'node:test'
import assert from 'node:assert/strict'
import { urlScriptGa4, urlScriptPostHog, urlScriptMetaPixel } from './adaptadores.ts'

test('urlScriptGa4 usa el id tal cual', () => {
  assert.equal(urlScriptGa4('G-EN2YQLRLEX'), 'https://www.googletagmanager.com/gtag/js?id=G-EN2YQLRLEX')
})

test('urlScriptPostHog usa el host por defecto (nube EU, nunca la de EE. UU. por defecto)', () => {
  assert.equal(urlScriptPostHog(), 'https://eu.i.posthog.com/static/array.js')
})

test('urlScriptPostHog quita barras finales del host', () => {
  assert.equal(urlScriptPostHog('https://eu.i.posthog.com///'), 'https://eu.i.posthog.com/static/array.js')
})

test('urlScriptMetaPixel es constante, no depende del id (el id va en el init, no en la URL)', () => {
  assert.equal(urlScriptMetaPixel(), 'https://connect.facebook.net/en_US/fbevents.js')
})
