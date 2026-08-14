// node --test --experimental-strip-types lib/comercio-canonico.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveComercio, cadenaDe, mismoComercio, normalizarComercio } from './comercio-canonico.ts'

// El caso que disparó el módulo: el extracto de julio avisó de «MERCADONA COLMENA SEVILLA:
// 187,67€ — no lo reconozco» con decenas de compras previas en Mercadona.
test('otra sucursal de la misma cadena NO es un comercio nuevo', () => {
  assert.ok(mismoComercio('MERCADONA COLMENA SEVILLA', 'MERCADONA SAN PABLO'))
  assert.ok(mismoComercio('DIA SEVILLA 2260', 'DIA SEVILLA 3417'))
  assert.ok(mismoComercio('CARREFOUR EXPRESS NERVION', 'CARREFOUR EXPRESS TRIANA'))
})

test('claveComercio quita el ruido de sucursal, terminal y forma jurídica', () => {
  assert.equal(claveComercio('PRIMAPRIX T88'), 'PRIMAPRIX')          // cadena conocida
  assert.equal(claveComercio('GALOS CMI S.L'), 'GALOS CMI')          // independiente + forma jurídica
  assert.equal(claveComercio('BRASERIA CASA SERRANO'), 'BRASERIA CASA SERRANO')
  assert.equal(claveComercio('CHIRINGUITO LEIVA 41'), 'CHIRINGUITO LEIVA')
  assert.equal(claveComercio('GASOLINERAS ISBILYA SEVILLA'), 'GASOLINERAS ISBILYA')
})

// El error simétrico y más caro: fundir comercios independientes distintos en una sola identidad
// taparía un cargo que de verdad no se reconoce.
test('comercios independientes distintos NO se confunden entre sí', () => {
  assert.ok(!mismoComercio('BRASERIA CASA SERRANO', 'CHIRINGUITO LEIVA'))
  assert.ok(!mismoComercio('FARMACIA CUERDA SIERRA', 'FARMACIA RODRIGUEZ'))
  assert.ok(!mismoComercio('RESTAURANTE LA MONTANERA', 'RESTAURANTE EL FARO'))
})

test('cadenaDe casa por palabra completa, nunca por trozo', () => {
  assert.equal(cadenaDe('DIA SEVILLA 2260'), 'DIA')
  assert.equal(cadenaDe('MEDIAMARKT SEVILLA'), 'MEDIAMARKT')   // no cae en 'DIA' dentro de MEDIA…
  assert.equal(cadenaDe('DIAGONAL MAR MUEBLES'), null)
  assert.equal(cadenaDe('ZARA HOME SEVILLA'), 'ZARA HOME')     // la marca más específica gana
  assert.equal(cadenaDe('BAR PEPE'), null)
})

test('normalización: acentos, puntuación y espacios no parten el mismo comercio', () => {
  assert.equal(normalizarComercio('  Cafetería  Ñuñez, S.L.  '), 'CAFETERIA NUNEZ S L')
  assert.ok(mismoComercio('Cafetería Ñuñez', 'CAFETERIA NUNEZ'))
  assert.equal(claveComercio(null), '')
  assert.equal(claveComercio('   '), '')
  assert.ok(!mismoComercio('', ''))   // sin nombre no se afirma que sean el mismo
})
