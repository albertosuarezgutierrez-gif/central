import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { congelarPorCambioFuente, normalizarFuenteBase, HORIZONTE_DIAS, type CambioFuenteInput } from './pricing-cambio-fuente.ts'

// Caso real: Duplex 01/05/2027, pasada del 24/10/2026. Última escritura (26/09) con bucket del mes a
// 176€; ese día mayo ya no tenía bucket y el salto de evento sobre la global pedía 146€.
const DUPLEX_0105: CambioFuenteInput = {
  fuenteAnterior: 'mes', fuenteActual: 'global', target: 146, old: 176, diasVista: 189, libera: false, maxPrice: null,
}

test('mes → global con objetivo más bajo: NO baja (caso Duplex 01/05/2027, 176 → 146)', () => {
  assert.equal(congelarPorCambioFuente(DUPLEX_0105), true)
})

test('sin cambio de fuente no hay guarda: global → global y mes → mes bajan con normalidad', () => {
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, fuenteAnterior: 'global' }), false)
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, fuenteActual: 'mes' }), false)
})

test('global → mes no se congela: la guarda es solo para cuando el mes SE VA', () => {
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, fuenteAnterior: 'global', fuenteActual: 'mes' }), false)
})

test('subir sí puede: con objetivo ≥ precio vivo no se congela', () => {
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, target: 176 }), false)
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, target: 190 }), false)
})

test('fuente anterior que NO consta (lectura caída, fila vieja sin columna): no congela a ciegas', () => {
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, fuenteAnterior: null }), false)
})

test('sin precio vivo no hay nada que proteger', () => {
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, old: null }), false)
})

test('dentro del horizonte de última hora manda la urgencia (mismo corte que la guarda de outlier)', () => {
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, diasVista: HORIZONTE_DIAS }), false)
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, diasVista: HORIZONTE_DIAS + 1 }), true)
})

test('un juicio real sobre la fecha (techo medido / rumor caído) la libera', () => {
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, libera: true }), false)
})

test('max_price del propietario manda si obliga a bajar', () => {
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, maxPrice: 160 }), false)
  assert.equal(congelarPorCambioFuente({ ...DUPLEX_0105, maxPrice: 200 }), true)
})

test('normalizarFuenteBase: solo mes/global son dato; NULL o basura = no consta', () => {
  assert.equal(normalizarFuenteBase('mes'), 'mes')
  assert.equal(normalizarFuenteBase('global'), 'global')
  for (const v of [null, undefined, '', 'MES', 'otro', 0]) assert.equal(normalizarFuenteBase(v), null)
})

// Cepo sobre el FUENTE del motor: tsc no ve si la guarda está cableada ni si la lectura trae la
// columna. Sin estas tres cosas el helper existiría y el motor seguiría bajando igual.
test('el motor lee base_fuente de la última escritura y aplica la guarda antes de escribir', () => {
  const src = readFileSync(new URL('../../app/api/sivra/pricing/apply/route.ts', import.meta.url), 'utf8')
  assert.match(src, /old_price AS prev_price, new_price AS ult_price, base_fuente AS fuente_prev/)
  assert.match(src, /normalizarFuenteBase\(x\.fuente_prev\)/)
  assert.match(src, /congelarPorCambioFuente\(\{[\s\S]{0,400}fuenteActual: useMonth \? 'mes' : 'global'/)
  assert.match(src, /congeladas_cambio_fuente:/)
})
