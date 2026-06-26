import { test } from 'node:test'
import assert from 'node:assert'
import { bloqueEquipaje, CONSIGNAS_CERCANAS } from './equipaje.ts'
import { detectCategory } from './reglas.ts'
import { contieneDatoInventado } from './guardrail.ts'

test('bloqueEquipaje deja claro que NO hay servicio de consigna', () => {
  assert.match(bloqueEquipaje(), /NO dispone de servicio de consigna|no ofrecer ese servicio/i)
})

test('bloqueEquipaje nombra las consignas recomendadas', () => {
  const b = bloqueEquipaje()
  for (const c of CONSIGNAS_CERCANAS) assert.ok(b.includes(c.nombre), `falta ${c.nombre}`)
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
  const ficha = bloqueEquipaje()
  const reply = `No tenemos consigna, pero puedes usar ${CONSIGNAS_CERCANAS[0].nombre} (${CONSIGNAS_CERCANAS[0].web}).`
  assert.equal(contieneDatoInventado(reply, ficha), false)
})
