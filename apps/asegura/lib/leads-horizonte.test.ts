import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { enConversacion, entraEnHorizonte, unaPorCliente, type CandidataCliente } from './leads-horizonte.ts'

const base = { horizonteDias: 90, intentos: 0, respondio: false, estado: 'competencia' }

test('sin contactar y dentro del horizonte: entra', () => {
  assert.equal(entraEnHorizonte({ ...base, dias: 45 }), true)
})

test('sin contactar y justo en el límite del horizonte: entra', () => {
  assert.equal(entraEnHorizonte({ ...base, dias: 90 }), true)
})

test('sin contactar y fuera del horizonte: NO entra («Por enviar» sigue cortado)', () => {
  assert.equal(entraEnHorizonte({ ...base, dias: 91 }), false)
  assert.equal(entraEnHorizonte({ ...base, dias: 300 }), false)
})

test('contactado (intentos > 0) y fuera del horizonte: entra', () => {
  assert.equal(entraEnHorizonte({ ...base, dias: 200, intentos: 1 }), true)
})

test('respondió y fuera del horizonte: entra aunque intentos sea 0', () => {
  assert.equal(entraEnHorizonte({ ...base, dias: 200, respondio: true }), true)
})

test('en_negociacion y fuera del horizonte: entra aunque no haya intentos ni respuesta', () => {
  assert.equal(entraEnHorizonte({ ...base, dias: 200, estado: 'en_negociacion' }), true)
})

test('pendiente_cliente y fuera del horizonte: entra', () => {
  assert.equal(entraEnHorizonte({ ...base, dias: 200, estado: 'pendiente_cliente' }), true)
})

// ── unaPorCliente: qué oportunidad representa al cliente ──

const opo = (over: Partial<CandidataCliente> & { id: string }) => ({
  clienteId: 'c1', dias: 100, estado: 'competencia', intentosGestiones: 0, respondio: false, ...over,
})

test('A competencia sin tocar a 150 días y B en_negociacion con llamadas a 300: se queda B y B entra en el horizonte', () => {
  const a = opo({ id: 'A', dias: 150 })
  const b = opo({ id: 'B', dias: 300, estado: 'en_negociacion', intentosGestiones: 2 })
  for (const orden of [[a, b], [b, a]]) {
    const r = unaPorCliente(orden).get('c1')
    assert.equal(r?.elegida.id, 'B')
    assert.equal(r?.otras, 1)
    assert.equal(entraEnHorizonte({ ...base, dias: r!.elegida.dias, intentos: r!.elegida.intentosGestiones, estado: r!.elegida.estado }), true)
  }
})

test('en conversación solo por llamadas de ESA oportunidad (estado competencia): gana a la que vence antes', () => {
  const a = opo({ id: 'A', dias: 20 })
  const b = opo({ id: 'B', dias: 200, intentosGestiones: 1 })
  assert.equal(unaPorCliente([a, b]).get('c1')?.elegida.id, 'B')
})

test('en conversación solo porque respondió: gana a la que vence antes', () => {
  const a = opo({ id: 'A', dias: 20 })
  const b = opo({ id: 'B', dias: 200, respondio: true })
  assert.equal(unaPorCliente([a, b]).get('c1')?.elegida.id, 'B')
})

test('entre iguales (ninguna en conversación), la que vence antes', () => {
  const a = opo({ id: 'A', dias: 150 })
  const b = opo({ id: 'B', dias: 40 })
  assert.equal(unaPorCliente([a, b]).get('c1')?.elegida.id, 'B')
  assert.equal(unaPorCliente([b, a]).get('c1')?.elegida.id, 'B')
})

test('entre iguales (las dos en conversación), la que vence antes', () => {
  const a = opo({ id: 'A', dias: 300, estado: 'pendiente_cliente' })
  const b = opo({ id: 'B', dias: 120, intentosGestiones: 1 })
  assert.equal(unaPorCliente([a, b]).get('c1')?.elegida.id, 'B')
})

test('clientes distintos no se funden y cada uno cuenta sus otras oportunidades', () => {
  const m = unaPorCliente([opo({ id: 'A', clienteId: 'x' }), opo({ id: 'B', clienteId: 'y' }), opo({ id: 'C', clienteId: 'x', dias: 5 })])
  assert.equal(m.size, 2)
  assert.deepEqual([m.get('x')?.elegida.id, m.get('x')?.otras], ['C', 1])
  assert.deepEqual([m.get('y')?.elegida.id, m.get('y')?.otras], ['B', 0])
})

test('enConversacion: competencia sin intentos ni respuesta NO lo está', () => {
  assert.equal(enConversacion({ estado: 'competencia', intentosGestiones: 0, respondio: false }), false)
})

// ── Cableado en `leadsCompetencia` (no se puede correr sin BD: se lee la fuente) ──

const fuenteCarril = readFileSync(new URL('./leads-competencia.ts', import.meta.url), 'utf8')

test('cableado: la fila de cada cliente la elige unaPorCliente (no «la que vence antes» a mano)', () => {
  assert.match(fuenteCarril, /const porCliente = unaPorCliente\(conFecha\)/)
})

test('cableado: los intentos de gestiones de ESA oportunidad llegan aparte de los envíos del cliente', () => {
  assert.match(fuenteCarril, /as "intentosGestiones"/)
})
