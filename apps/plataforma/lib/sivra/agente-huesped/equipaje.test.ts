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

test('punto físico por zona: Dúplex → Plaza del Duque, Busto/Socorro → Alfalfa', () => {
  assert.ok(bloqueEquipaje('prop_duplex_center').includes(CONSIGNA_POR_ZONA.duplex.nombre))
  assert.ok(bloqueEquipaje('prop_duplex_center').includes('Plaza del Duque'))
  for (const pid of ['prop_house_sevillana', 'prop_busto_reform', 'prop_luxury_busto']) {
    assert.ok(bloqueEquipaje(pid).includes(CONSIGNA_POR_ZONA.busto.nombre), `falta Alfalfa en ${pid}`)
  }
})

test('piso sin zona conocida → solo redes (sin punto físico de zona)', () => {
  const b = bloqueEquipaje('all')
  assert.ok(!b.includes(CONSIGNA_POR_ZONA.busto.nombre) && !b.includes(CONSIGNA_POR_ZONA.duplex.nombre))
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
  const reply = `No tenemos consigna, pero puedes usar ${CONSIGNA_POR_ZONA.duplex.nombre} (${CONSIGNA_POR_ZONA.duplex.web}).`
  assert.equal(contieneDatoInventado(reply, ficha), false)
})
