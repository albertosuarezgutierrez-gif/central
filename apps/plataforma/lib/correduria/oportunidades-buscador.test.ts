import test from 'node:test'
import assert from 'node:assert/strict'
import { resumenOportunidades } from './oportunidades-buscador.ts'

const HOY = '2026-09-28'
const paso = { estado: 'en_negociacion', tipo: 'llamada', fechaLimite: '2026-09-30' }

test('🚨 sin contar no se afirma nada', () => {
  assert.deepEqual(resumenOportunidades({ oportunidadesAbiertas: null, oportunidadesAparcadas: null, siguientePaso: null }, HOY), { estado: 'sin_dato' })
})

test('activas con su siguiente paso, destacadas', () => {
  const r = resumenOportunidades({ oportunidadesAbiertas: 2, oportunidadesAparcadas: 0, siguientePaso: paso }, HOY)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.texto, '2 oportunidades activas')
  assert.equal(r.destacado, true)
  assert.equal(r.paso, 'Interesado · Llamada 30/09')
  assert.equal(r.atrasado, false)
  assert.equal(r.ofrecerAbrir, false)
})

test('🚨 solo aparcadas: se dicen pero NO se destacan ni se ofrece abrir otra', () => {
  const r = resumenOportunidades({ oportunidadesAbiertas: 0, oportunidadesAparcadas: 1, siguientePaso: null }, HOY)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.texto, '1 aparcada')
  assert.equal(r.destacado, false)
  assert.equal(r.ofrecerAbrir, false)
})

test('paso con fecha pasada = atrasado', () => {
  const r = resumenOportunidades({ oportunidadesAbiertas: 1, oportunidadesAparcadas: 0, siguientePaso: { ...paso, fechaLimite: '2026-09-20' } }, HOY)
  assert.equal(r.estado === 'ok' && r.atrasado, true)
})

test('ninguna abierta: se ofrece abrir; con aparcadas desconocidas, no', () => {
  const cero = resumenOportunidades({ oportunidadesAbiertas: 0, oportunidadesAparcadas: 0, siguientePaso: null }, HOY)
  assert.equal(cero.estado === 'ok' && cero.ofrecerAbrir, true)
  assert.equal(cero.estado === 'ok' && cero.texto, 'sin oportunidades abiertas')
  // asegura anterior: sabe las activas pero no manda aparcadas → no se afirma «ninguna abierta».
  const viejo = resumenOportunidades({ oportunidadesAbiertas: 0, oportunidadesAparcadas: null, siguientePaso: null }, HOY)
  assert.equal(viejo.estado === 'ok' && viejo.ofrecerAbrir, false)
  assert.equal(viejo.estado === 'ok' && viejo.texto, 'sin oportunidades activas')
})
