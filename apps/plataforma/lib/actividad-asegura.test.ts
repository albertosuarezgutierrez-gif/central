import assert from 'node:assert/strict'
import { test } from 'node:test'

import { interpretarActividad } from './actividad-asegura.ts'

const OK = {
  estado: 'ok',
  total: 3,
  embudo: { clientes: 80, conEmail: 44, invitados: 40, hanEntrado: 6, activos30: 2 },
  eventos: [
    { id: 'a1', tipo: 'acceso', fecha: '2026-09-12T09:00:00.000Z', clienteId: 'c1', cliente: 'Ana Ruiz', texto: null },
  ],
}

test('una respuesta buena se lee entera', () => {
  const r = interpretarActividad(OK)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.eventos.length, 1)
  assert.equal(r.eventos[0].cliente, 'Ana Ruiz')
  assert.equal(r.total, 3)
  assert.equal(r.embudo.hanEntrado, 6)
  assert.equal(r.ilegibles, 0)
})

test('una respuesta ilegible NO es un muro vacío', () => {
  // El cepo de la regla: degradar a `{ok:true, eventos:[]}` le diría a Alberto
  // que sus clientes no están usando la intranet cuando lo que pasa es que no
  // se ha podido leer.
  for (const bruto of [null, 'no', 42, [], {}, { estado: 'ok' }, { estado: 'ok', eventos: 'x' }]) {
    const r = interpretarActividad(bruto)
    assert.equal(r.ok, false, `debería fallar con ${JSON.stringify(bruto)}`)
  }
})

test('sin configurar y error de asegura se distinguen', () => {
  const a = interpretarActividad({ estado: 'sin_configurar' })
  assert.equal(a.ok, false)
  if (!a.ok) assert.equal(a.motivo, 'sin_configurar')

  const b = interpretarActividad({ estado: 'error', causa: 'credenciales' })
  assert.equal(b.ok, false)
  if (!b.ok) {
    assert.equal(b.motivo, 'asegura_error')
    assert.notEqual(b.causa, null)
  }
})

test('una cuenta del embudo que no llega es «no se sabe», nunca 0', () => {
  const r = interpretarActividad({ ...OK, embudo: { clientes: 80, hanEntrado: null, activos30: 'muchos' } })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.embudo.clientes, 80)
  assert.equal(r.embudo.hanEntrado, null)
  assert.equal(r.embudo.activos30, null)
  assert.equal(r.embudo.conEmail, null)
})

test('el embudo entero ausente no se inventa a ceros', () => {
  const r = interpretarActividad({ estado: 'ok', eventos: [], total: 0 })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.embudo, {
    clientes: null,
    conEmail: null,
    invitados: null,
    hanEntrado: null,
    activos30: null,
  })
})

test('una fila sin id, sin fecha o con fecha inválida se CUENTA, no desaparece', () => {
  const r = interpretarActividad({
    ...OK,
    eventos: [
      OK.eventos[0],
      { tipo: 'acceso', fecha: '2026-09-12T09:00:00.000Z' },
      { id: 'b', tipo: 'acceso' },
      { id: 'c', tipo: 'acceso', fecha: 'el martes' },
      { id: 'd', fecha: '2026-09-12T09:00:00.000Z' },
    ],
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.eventos.length, 1)
  assert.equal(r.ilegibles, 4)
})

test('un evento sin ficha detrás se pinta igual, con clienteId null', () => {
  const r = interpretarActividad({
    ...OK,
    eventos: [{ id: 'x', tipo: 'parte', fecha: '2026-09-12T09:00:00.000Z', clienteId: null, cliente: null }],
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.eventos.length, 1, 'un evento sin ficha no se esconde: identificarle es trabajo')
  assert.equal(r.eventos[0].clienteId, null)
  assert.equal(r.eventos[0].cliente, null)
})

test('los filtros descartados por el puerto llegan a la pantalla', () => {
  const r = interpretarActividad({ ...OK, descartados: ['dias=abc', '', null, 7] })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.descartados, ['dias=abc'])
})

test('sin total del puerto se cae a lo que se ve, no a 0', () => {
  const r = interpretarActividad({ estado: 'ok', eventos: OK.eventos })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.total, 1)
})
