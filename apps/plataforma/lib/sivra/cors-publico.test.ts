import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cabecerasCors } from './cors-publico.ts'

test('Vary: Origin va SIEMPRE, tambien sin Origin y con un origen no permitido', () => {
  // Es el test que da sentido al módulo: sin este `Vary`, el CDN sirve a TODO el mundo la
  // primera copia que cacheó. Si esa vino sin `Origin` (un curl, un bot, un health-check),
  // la copia no lleva `Access-Control-Allow-Origin` y el navegador la rechaza durante los
  // 10 minutos de `s-maxage`. Roto en el navegador, impecable por curl.
  assert.equal(cabecerasCors(null).Vary, 'Origin')
  assert.equal(cabecerasCors('https://un-sitio-cualquiera.com').Vary, 'Origin')
  assert.equal(cabecerasCors('https://housesevillana.es').Vary, 'Origin')
})

test('el dominio de la landing recibe su origen literal', () => {
  const h = cabecerasCors('https://housesevillana.es')
  assert.equal(h['Access-Control-Allow-Origin'], 'https://housesevillana.es')
  assert.equal(cabecerasCors('https://www.housesevillana.es')['Access-Control-Allow-Origin'],
    'https://www.housesevillana.es')
})

test('un preview de Vercel de ESA landing pasa', () => {
  const o = 'https://house-sevillana-landing-git-cl-956d92-pisos-turisticos-projects.vercel.app'
  assert.equal(cabecerasCors(o)['Access-Control-Allow-Origin'], o)
})

test('un origen ajeno no recibe cabecera, pero la respuesta sigue variando por Origin', () => {
  const h = cabecerasCors('https://competencia.com')
  assert.equal(h['Access-Control-Allow-Origin'], undefined)
  assert.equal(h.Vary, 'Origin')
})

test('la regex del preview esta anclada por los dos extremos', () => {
  // Sin el `$`, un dominio de otro que EMPIECE por el nuestro colaría.
  assert.equal(
    cabecerasCors('https://house-sevillana-landing-x.vercel.app.de-otro.com')['Access-Control-Allow-Origin'],
    undefined,
  )
  // Y sin el `^`, uno que lo lleve dentro.
  assert.equal(
    cabecerasCors('https://malo.com/https://house-sevillana-landing-x.vercel.app')['Access-Control-Allow-Origin'],
    undefined,
  )
})

test('sin Origin no se inventa una cabecera permisiva', () => {
  assert.equal(cabecerasCors(null)['Access-Control-Allow-Origin'], undefined)
})
