import { test } from 'node:test'
import assert from 'node:assert/strict'
import { urlScriptGa4, urlScriptPostHog, urlScriptMetaPixel, cargarGa4 } from './adaptadores.ts'

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

// --- Cepo del beacon de GA4 --------------------------------------------------------
// gtag.js recorre el dataLayer y procesa SOLO las entradas que son objetos `Arguments`.
// Si se empuja un array plano (lo que produce `(...args) => push(args)`), el comando se
// descarta sin error: el script se sirve con 200, el dataLayer "parece" correcto y no
// sale ni un `/g/collect`. Cero datos con todo en verde, que es el fallo más caro.
// Este cepo mira el TIPO de lo empujado, no su contenido, porque el contenido era
// correcto el día que la medición estaba muerta (15/09/2026, grupoasegura.es).

function conDomFalso<T>(fn: () => T): { resultado: T; dataLayer: unknown[]; scripts: string[] } {
  const previo = { window: globalThis.window, document: globalThis.document }
  const scripts: string[] = []
  const g = globalThis as unknown as Record<string, unknown>
  g.document = {
    createElement: () => ({ async: false, src: '', onload: null }),
    head: { appendChild: (s: { src: string }) => scripts.push(s.src) },
  }
  g.window = g as unknown as Window
  try {
    const resultado = fn()
    return { resultado, dataLayer: (g.dataLayer as unknown[]) ?? [], scripts }
  } finally {
    g.window = previo.window
    g.document = previo.document
    delete g.dataLayer
    delete g.gtag
  }
}

test('cargarGa4 empuja objetos Arguments al dataLayer, NUNCA arrays (si no, gtag.js lo ignora y no mide)', () => {
  const { dataLayer } = conDomFalso(() => cargarGa4('G-QP5DTDLJ5F'))

  assert.equal(dataLayer.length, 2, 'se esperan los dos comandos: js y config')
  for (const entrada of dataLayer) {
    assert.equal(
      Object.prototype.toString.call(entrada),
      '[object Arguments]',
      'gtag.js descarta en silencio lo que no sea un objeto Arguments',
    )
    assert.equal(Array.isArray(entrada), false, 'un array plano deja la medición muerta sin error')
  }
})

test('cargarGa4 manda el config con el id que se le pasa y pide el script de ese mismo id', () => {
  const { dataLayer, scripts } = conDomFalso(() => cargarGa4('G-QP5DTDLJ5F'))

  const config = Array.from(dataLayer[1] as IArguments)
  assert.deepEqual(config, ['config', 'G-QP5DTDLJ5F'])
  assert.deepEqual(scripts, ['https://www.googletagmanager.com/gtag/js?id=G-QP5DTDLJ5F'])
})
