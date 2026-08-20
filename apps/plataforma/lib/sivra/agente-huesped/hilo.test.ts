import { test } from 'node:test'
import assert from 'node:assert'
import { hiloComoMensajes, dedupHilo } from './hilo.ts'

const H = (from: 'guest' | 'host', text: string) => ({ id: text, from, text, ts: '' })

test('mapea huésped→user y anfitrión→assistant', () => {
  const out = hiloComoMensajes([H('guest', 'hola'), H('host', 'buenas')], 'otra cosa')
  assert.deepEqual(out, [
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: 'buenas' },
  ])
})

test('quita el último si coincide con la pregunta actual (evita duplicar el turno)', () => {
  const out = hiloComoMensajes([H('guest', 'hola'), H('host', 'buenas'), H('guest', '¿wifi?')], '¿wifi?')
  assert.deepEqual(out, [
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: 'buenas' },
  ])
})

test('descarta mensajes vacíos', () => {
  const out = hiloComoMensajes([H('guest', '  '), H('guest', 'hola')], 'x')
  assert.deepEqual(out, [{ role: 'user', content: 'hola' }])
})

test('cap a los N más recientes', () => {
  const hist = Array.from({ length: 20 }, (_, i) => H('guest', `m${i}`))
  const out = hiloComoMensajes(hist, 'nueva', 15)
  assert.equal(out.length, 15)
  assert.equal(out[0].content, 'm5')      // los 15 últimos: m5..m19
  assert.equal(out[14].content, 'm19')
})

test('historial vacío → array vacío', () => {
  assert.deepEqual(hiloComoMensajes([], 'hola'), [])
})

const M = (from: 'guest' | 'host', text: string, ts: string) => ({ id: `${text}-${ts}`, from, text, ts })

test('quita el automático duplicado que manda Smoobu por partida doble', () => {
  const out = dedupHilo([
    M('host', 'Booking Confirmation', '2026-08-20 13:30:20'),
    M('host', 'Booking Confirmation', '2026-08-20 13:30:20'),
    M('guest', 'gracias', '2026-08-20 13:31:00'),
  ])
  assert.equal(out.length, 2)
})

test('no toca una repetición legítima horas después', () => {
  const out = dedupHilo([
    M('guest', '¿hola?', '2026-08-20 10:00:00'),
    M('guest', '¿hola?', '2026-08-20 14:00:00'),
  ])
  assert.equal(out.length, 2)
})
