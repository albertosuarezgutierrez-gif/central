import test from 'node:test'
import assert from 'node:assert/strict'
import { ACCESO, bloqueAcceso, codigosQueFaltan } from './acceso.ts'

const PISOS = ['prop_duplex_center', 'prop_house_sevillana', 'prop_luxury_busto', 'prop_busto_reform']

test('los cuatro pisos están definidos con dirección, mapa y pasos', () => {
  for (const p of PISOS) {
    const a = ACCESO[p]
    assert.ok(a, p)
    assert.ok(a.direccion.length > 10, `${p}: dirección`)
    assert.ok(a.mapaPiso.startsWith('https://'), `${p}: mapa`)
    assert.ok(a.pasos.length >= 3, `${p}: pasos`)
    for (const f of a.fotos) assert.ok(f.startsWith('https://'), `${p}: foto ${f}`)
  }
})

test('sin códigos: el bloque de 7 días no contiene marcadores sin rellenar ni códigos reales', () => {
  for (const p of PISOS) {
    const b = bloqueAcceso(p, { portal: '1111', caja: '2222' }, { conCodigos: false })
    assert.ok(!b.includes('{PORTAL}') && !b.includes('{CAJA}'), p)
    // Aunque los códigos vengan, la versión de 7 días NO los enseña (dos tiempos).
    assert.ok(!b.includes('1111') && !b.includes('2222'), p)
    assert.ok(b.includes('víspera'), `${p}: anuncia cuándo llegan los códigos`)
  }
})

test('con códigos: el bloque de víspera los contiene, y un NULL se declara sin inventar', () => {
  const con = bloqueAcceso('prop_luxury_busto', { portal: '2022#', caja: '2232', wifiSsid: 'red-x', wifiPass: 'pw' }, { conCodigos: true })
  assert.ok(con.includes('2022#') && con.includes('2232'))
  assert.ok(con.includes('red-x') && con.includes('pw'))
  const sinCaja = bloqueAcceso('prop_luxury_busto', { portal: '2022#', caja: null }, { conCodigos: true })
  assert.ok(sinCaja.includes('te lo confirmamos hoy mismo'))
  assert.ok(!sinCaja.includes('{CAJA}'))
})

test('el Dúplex avisa de que las llaves están FUERA, antes de la dirección de entrada', () => {
  const b = bloqueAcceso('prop_duplex_center', { caja: '0000' }, { conCodigos: true })
  assert.ok(b.includes('Javier Lasso de la Vega'))
  assert.ok(b.includes('NO están en el apartamento'))
  assert.ok(b.indexOf('MUY IMPORTANTE') < b.indexOf('CÓMO ENTRAR'))
})

test('codigosQueFaltan declara exactamente lo que el piso necesita y no tiene', () => {
  assert.deepEqual(codigosQueFaltan('prop_luxury_busto', { portal: null, caja: '2232' }), ['código del portal'])
  assert.deepEqual(codigosQueFaltan('prop_duplex_center', { caja: null }), ['código de la caja de llaves'])
  // House no usa {CAJA}: solo teclado del portal.
  assert.deepEqual(codigosQueFaltan('prop_house_sevillana', { portal: '987654#' }), [])
  assert.deepEqual(codigosQueFaltan('piso_inexistente', {}), [])
})
