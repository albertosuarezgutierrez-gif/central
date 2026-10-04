import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarLecturaTope, resultadoAmpliar } from './tope-avant2.ts'

const OK = {
  estado: 'ok', mes: '2026-10', gastadoCents: 7000, topeCents: 7000,
  pendientes: [
    { id: '1', tipo: 'aviso', texto: 'aviso', boton: null },
    { id: '2', tipo: 'bloqueo', texto: 'bloq', boton: { texto: '✅ Autorizar', callback: 'cas_tope:202610-7000' } },
  ],
}

test('lectura buena → pendientes con su botón', () => {
  const l = interpretarLecturaTope(200, OK)
  assert.equal(l.estado, 'ok')
  assert.equal(l.estado === 'ok' && l.pendientes.length, 2)
  assert.equal(l.estado === 'ok' && l.pendientes[1]!.boton?.callback, 'cas_tope:202610-7000')
})

test('🚨 «no se ha podido mirar» NUNCA es «nada pendiente»', () => {
  for (const [status, json] of [
    [500, { estado: 'error', motivo: 'BD caída' }],
    [401, null],
    [404, null],
    [503, { estado: 'sin_configurar' }],
    [200, { estado: 'ok' }], // sin pendientes ni gasto
    [200, { ...OK, gastadoCents: null }],
    [0, null],
  ] as const) {
    assert.equal(interpretarLecturaTope(status, json).estado, 'sin_datos', `${status} ${JSON.stringify(json)}`)
  }
})

test('un bloqueo sin botón no se manda: dejaría a Alberto sin forma de desbloquear', () => {
  const malo = { ...OK, pendientes: [{ id: '2', tipo: 'bloqueo', texto: 'bloq', boton: null }] }
  assert.equal(interpretarLecturaTope(200, malo).estado, 'sin_datos')
})

test('el botón: ampliado, repetido, rechazado y desconocido se dicen distinto', () => {
  assert.match(resultadoAmpliar(200, { estado: 'ampliado', topeCents: 10000 }).linea, /100,00€/)
  assert.match(resultadoAmpliar(200, { estado: 'ya_estaba', topeCents: 10000 }).linea, /no se suma dos veces/)
  assert.match(resultadoAmpliar(409, { estado: 'rechazado', motivo: 'mes pasado' }).linea, /mes pasado/)
  // Fallo de red: NO se afirma ni que se amplió ni que no.
  const r = resultadoAmpliar(0, null)
  assert.equal(r.toast, 'No sé si se ha ampliado')
})
