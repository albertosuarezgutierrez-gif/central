import { test } from 'node:test'
import assert from 'node:assert'
import { redactarDesdeIdea } from './redactar.ts'
import type { ContextoRedaccion } from './redactar.ts'

const CTX: ContextoRedaccion = {
  pregunta: '¿A qué hora llegará la limpieza?',
  historial: 'Huésped: ¿Cuándo hacen la limpieza?\nAnfitrión: Pasará por la mañana.',
  idioma: 'es',
  propiedad: 'House Sevillana',
  guestName: 'John',
  checkIn: '2026-06-28',
  checkOut: '2026-07-01',
}

const stub = (out: string, capture?: (args: any[]) => void) =>
  async (...args: any[]) => { capture?.(args); return out }

test('devuelve el texto redactado por la IA', async () => {
  const res = await redactarDesdeIdea('lo siento, la limpieza ya va de camino', CTX,
    stub('Lo sentimos, la empresa de limpieza ya está en camino. Llegarán en breves momentos.'))
  assert.equal(res, 'Lo sentimos, la empresa de limpieza ya está en camino. Llegarán en breves momentos.')
})

test('pasa la idea y el contexto al modelo', async () => {
  let seen: any[] = []
  await redactarDesdeIdea('limpieza de camino', CTX, stub('respuesta', a => { seen = a }))
  const [messages, opts] = seen
  assert.match(opts.system, /House Sevillana/)
  assert.match(messages[0].content, /limpieza de camino/)
  assert.match(messages[0].content, /¿A qué hora llegará la limpieza\?/)
  assert.match(messages[0].content, /español/)
})

test('incluye el historial en el prompt', async () => {
  let seen: any[] = []
  await redactarDesdeIdea('todo ok', CTX, stub('ok', a => { seen = a }))
  const [messages] = seen
  assert.match(messages[0].content, /Huésped: ¿Cuándo hacen la limpieza\?/)
})

test('sin historial funciona igualmente', async () => {
  const ctxSinHist = { ...CTX, historial: '' }
  const res = await redactarDesdeIdea('confirma la reserva', ctxSinHist, stub('Su reserva está confirmada.'))
  assert.equal(res, 'Su reserva está confirmada.')
})

test('idea vacía → cadena vacía sin llamar al modelo', async () => {
  let called = false
  const res = await redactarDesdeIdea('', CTX, async () => { called = true; return 'x' })
  assert.equal(res, '')
  assert.equal(called, false)
})

test('si el modelo lanza, devuelve cadena vacía', async () => {
  const res = await redactarDesdeIdea('algo', CTX, async () => { throw new Error('boom') })
  assert.equal(res, '')
})

test('pasa el idioma correcto para huésped en inglés', async () => {
  let seen: any[] = []
  await redactarDesdeIdea('la limpieza viene', { ...CTX, idioma: 'en' }, stub('The cleaning team is on the way.', a => { seen = a }))
  const [messages] = seen
  assert.match(messages[0].content, /inglés/)
})
