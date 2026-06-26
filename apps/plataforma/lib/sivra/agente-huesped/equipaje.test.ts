import { test } from 'node:test'
import assert from 'node:assert'
import { bloqueEquipaje, CONSIGNAS_RED, CONSIGNA_POR_ZONA, zonaDePiso } from './equipaje.ts'
import { detectCategory } from './reglas.ts'
import { contieneDatoInventado } from './guardrail.ts'

test('bloqueEquipaje deja claro que NO hay servicio de consigna', () => {
  assert.match(bloqueEquipaje('prop_duplex_center'), /NO dispone de servicio de consigna|no ofrecer ese servicio/i)
})

test('las redes salen para todos los pisos', () => {
  for (const pid of ['prop_duplex_center', 'prop_busto_reform', '']) {
    const b = bloqueEquipaje(pid)
    for (const c of CONSIGNAS_RED) assert.ok(b.includes(c.nombre), `falta ${c.nombre} en ${pid || '(sin piso)'}`)
  }
})

test('zonaDePiso mapea cada piso a su zona', () => {
  assert.equal(zonaDePiso('prop_duplex_center'), 'duplex')
  assert.equal(zonaDePiso('prop_house_sevillana'), 'busto')
  assert.equal(zonaDePiso('prop_busto_reform'), 'busto')
  assert.equal(zonaDePiso('prop_luxury_busto'), 'busto')
  assert.equal(zonaDePiso('all'), null)
})

test('punto físico por zona: Dúplex → Plaza del Duque, Busto/Socorro → Castellar (+ Alfalfa)', () => {
  assert.ok(bloqueEquipaje('prop_duplex_center').includes(CONSIGNA_POR_ZONA.duplex[0].nombre))
  assert.ok(bloqueEquipaje('prop_duplex_center').includes('Plaza del Duque'))
  for (const pid of ['prop_house_sevillana', 'prop_busto_reform', 'prop_luxury_busto']) {
    const b = bloqueEquipaje(pid)
    // El más cercano de la zona busto es Lock & Explore Castellar; Alfalfa queda como alternativa.
    assert.ok(b.includes(CONSIGNA_POR_ZONA.busto[0].nombre), `falta Castellar en ${pid}`)
    assert.ok(b.includes(CONSIGNA_POR_ZONA.busto[1].nombre), `falta Alfalfa en ${pid}`)
    assert.ok(b.includes('Castellar'), `falta C/ Castellar en ${pid}`)
  }
})

test('la más cercana de busto es Castellar, ANTES que Alfalfa (orden por cercanía)', () => {
  const b = bloqueEquipaje('prop_luxury_busto')
  assert.ok(b.indexOf(CONSIGNA_POR_ZONA.busto[0].nombre) < b.indexOf(CONSIGNA_POR_ZONA.busto[1].nombre))
  assert.match(b, new RegExp(`más cercana a este apartamento: ${CONSIGNA_POR_ZONA.busto[0].nombre.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`))
})

test('piso sin zona conocida → solo redes (sin punto físico de zona)', () => {
  const b = bloqueEquipaje('all')
  for (const zona of ['busto', 'duplex']) {
    for (const c of CONSIGNA_POR_ZONA[zona]) assert.ok(!b.includes(c.nombre), `no debería salir ${c.nombre}`)
  }
})

test('detectCategory equipaje (varias formas)', () => {
  assert.equal(detectCategory('¿dónde guardo las maletas?'), 'equipaje')
  assert.equal(detectCategory('para guardar las maletas donde es?'), 'equipaje')
  assert.equal(detectCategory('where can I leave my luggage?'), 'equipaje')
  assert.equal(detectCategory('hay consigna?'), 'equipaje')
})

test('"dónde dejar las maletas" cae en equipaje, NO en checkout (por "dejar")', () => {
  assert.equal(detectCategory('¿dónde puedo dejar las maletas?'), 'equipaje')
})

test('checkout sigue detectándose cuando toca', () => {
  assert.equal(detectCategory('¿a qué hora es el check-out?'), 'checkout')
})

test('las webs del bloque no disparan el guardrail (están en la ficha)', () => {
  const ficha = bloqueEquipaje('prop_duplex_center')
  const reply = `No tenemos consigna, pero puedes usar ${CONSIGNA_POR_ZONA.duplex[0].nombre} (${CONSIGNA_POR_ZONA.duplex[0].web}).`
  assert.equal(contieneDatoInventado(reply, ficha), false)
})

test('la web de Castellar (busto) tampoco dispara el guardrail', () => {
  const ficha = bloqueEquipaje('prop_luxury_busto')
  const reply = `Puedes dejarlas en ${CONSIGNA_POR_ZONA.busto[0].nombre} (${CONSIGNA_POR_ZONA.busto[0].web}).`
  assert.equal(contieneDatoInventado(reply, ficha), false)
})
