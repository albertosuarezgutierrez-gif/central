import { test } from 'node:test'
import assert from 'node:assert'
import { faseReserva, aplicaEarlyCheckin } from './fases.ts'

test('antes de la llegada → pre-llegada', () => {
  assert.equal(faseReserva('2026-07-10', '2026-07-12', '2026-07-15'), 'pre-llegada')
})

test('el MISMO día de la llegada → dia-llegada (no en-estancia)', () => {
  assert.equal(faseReserva('2026-07-12', '2026-07-12', '2026-07-15'), 'dia-llegada')
})

test('entre llegada y salida → en-estancia', () => {
  assert.equal(faseReserva('2026-07-13', '2026-07-12', '2026-07-15'), 'en-estancia')
})

test('el día de salida sigue siendo en-estancia (aún no ha pasado el checkout)', () => {
  assert.equal(faseReserva('2026-07-15', '2026-07-12', '2026-07-15'), 'en-estancia')
})

test('después de la salida → post-estancia', () => {
  assert.equal(faseReserva('2026-07-16', '2026-07-12', '2026-07-15'), 'post-estancia')
})

test('sin fechas fiables → en-estancia (comportamiento previo, no rompe)', () => {
  assert.equal(faseReserva('2026-07-12', '', ''), 'en-estancia')
})

test('el early check-in aplica en pre-llegada y el día de llegada', () => {
  assert.equal(aplicaEarlyCheckin('pre-llegada'), true)
  assert.equal(aplicaEarlyCheckin('dia-llegada'), true) // el fix: antes el día de llegada NO lo ofrecía
  assert.equal(aplicaEarlyCheckin('en-estancia'), false)
  assert.equal(aplicaEarlyCheckin('post-estancia'), false)
})

test('bloqueAntiguedad: solo avisa pasadas 6 h y nunca inventa una fecha', async () => {
  const { bloqueAntiguedad } = await import('./fases.ts')
  const ahora = new Date('2026-09-28T07:15:00Z')
  assert.equal(bloqueAntiguedad('2026-09-28T05:00:00Z', ahora), '')
  assert.equal(bloqueAntiguedad(undefined, ahora), '')
  assert.equal(bloqueAntiguedad('no-es-fecha', ahora), '')
  const b = bloqueAntiguedad('2026-09-27T16:14:00Z', ahora)   // caso 154692216: 15 h antes
  assert.match(b, /hace 15 h/)
  assert.match(b, /SIGUE VIGENTE/)
})
