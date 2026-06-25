import { test } from 'node:test'
import assert from 'node:assert'
import { aplicarRetoque } from './retoque.ts'

// Stub de la función de completado (inyectada) para no llamar a la IA real.
const stub = (out: string, capture?: (args: any[]) => void) =>
  async (...args: any[]) => { capture?.(args); return out }

test('aplica la instrucción y devuelve el texto revisado', async () => {
  const res = await aplicarRetoque('Sí, dispone de cafetera y microondas.', 'añade que la cafetera es italiana', 'es',
    stub('Sí, dispone de cafetera italiana y microondas.'))
  assert.equal(res, 'Sí, dispone de cafetera italiana y microondas.')
})

test('pasa idioma, borrador e instrucción al modelo', async () => {
  let seen: any[] = []
  await aplicarRetoque('Yes, there is a coffee machine.', 'di que es italiana', 'en',
    stub('Yes, there is an Italian coffee machine.', a => { seen = a }))
  const [messages, opts] = seen
  assert.match(opts.system, /inglés/)
  assert.match(messages[0].content, /Yes, there is a coffee machine\./)
  assert.match(messages[0].content, /di que es italiana/)
})

test('borrador o instrucción vacíos → cadena vacía sin llamar al modelo', async () => {
  let called = false
  const res = await aplicarRetoque('', 'algo', 'es', async () => { called = true; return 'x' })
  assert.equal(res, '')
  assert.equal(called, false)
})

test('si el modelo lanza, devuelve cadena vacía', async () => {
  const res = await aplicarRetoque('borrador', 'instr', 'es', async () => { throw new Error('boom') })
  assert.equal(res, '')
})
