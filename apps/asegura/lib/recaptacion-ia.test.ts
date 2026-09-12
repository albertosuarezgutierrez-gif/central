import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pulirConIA } from './recaptacion-ia.ts'

test('si la IA falla, devuelve el texto base sin tocar', async () => {
  const base = 'Hola Pablo, texto base.'
  const resultado = await pulirConIA(base, async () => { throw new Error('sin red') })
  assert.equal(resultado, base)
})

test('si la IA responde, usa su texto', async () => {
  const base = 'Hola Pablo, texto base.'
  const resultado = await pulirConIA(base, async () => ({ text: 'Hola Pablo, versión pulida.' }))
  assert.equal(resultado, 'Hola Pablo, versión pulida.')
})

test('si la IA responde vacío, se queda con el texto base', async () => {
  const base = 'Hola Pablo, texto base.'
  const resultado = await pulirConIA(base, async () => ({ text: '   ' }))
  assert.equal(resultado, base)
})
