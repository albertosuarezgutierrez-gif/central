import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerLimitesRecomendados } from './limites-hogar.ts'

// Forma del ejemplo del portal (`docs/CODEOSCOPIC-API-PORTAL.md` § Hogar):
// `{ buildingsLimit: {average, highest, lowest}, contentsLimit: {…}, results: [...] }`.
test('lee continente y contenido con media, mínimo y máximo', () => {
  const r = leerLimitesRecomendados({
    buildingsLimit: { average: 98000.4, highest: 120000, lowest: 80000 },
    contentsLimit: { average: 22000, highest: 30000, lowest: 15000 },
    results: [{ product: { id: 'x' }, buildingsLimit: 100000, contentsLimit: 20000 }],
  })
  assert.deepEqual(r, {
    continente: { media: 98000, minimo: 80000, maximo: 120000 },
    contenido: { media: 22000, minimo: 15000, maximo: 30000 },
  })
})

test('lo que no viene es null, NUNCA 0: un capital recomendado a 0 € no existe', () => {
  assert.deepEqual(leerLimitesRecomendados({ buildingsLimit: { average: 0 } }), { continente: null, contenido: null })
  assert.deepEqual(leerLimitesRecomendados(null), { continente: null, contenido: null })
  assert.deepEqual(leerLimitesRecomendados({ contentsLimit: { average: '15000' } }), {
    continente: null,
    contenido: { media: 15000, minimo: null, maximo: null },
  })
})
