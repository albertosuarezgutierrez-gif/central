import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hayTrabajoOk, vistaPresupuestoRpa } from './presupuesto-rpa-vista.ts'

const ID = '0b7f1c52-3a4d-4e8e-9c1a-5d6e7f809a1b'

test('visibilidad: solo con algún trabajo ok', () => {
  assert.equal(hayTrabajoOk(null), false)
  assert.equal(hayTrabajoOk([]), false)
  assert.equal(hayTrabajoOk([{ estado: 'error' }, { estado: 'en_curso' }]), false)
  assert.equal(hayTrabajoOk([{ estado: 'error' }, { estado: 'ok' }]), true)
})

test('creado: borrador con id y número de ofertas', () => {
  const v = vistaPresupuestoRpa(200, { estado: 'creado', presupuestoId: ID, ofertas: 3 })
  assert.equal(v.tono, 'ok'); assert.equal(v.presupuestoId, ID); assert.match(v.texto, /3 ofertas/)
})

test('ya_existe: informativo, enlaza y no dice "creado"', () => {
  const v = vistaPresupuestoRpa(200, { estado: 'ya_existe', presupuestoId: ID, ofertas: 1 })
  assert.equal(v.tono, 'info'); assert.equal(v.presupuestoId, ID); assert.match(v.texto, /Ya había/); assert.match(v.texto, /1 oferta[^s]/)
})

test('id no uuid no se enlaza; sin ofertas (409) y errores', () => {
  assert.equal(vistaPresupuestoRpa(200, { estado: 'creado', presupuestoId: '../x' }).presupuestoId, null)
  assert.match(vistaPresupuestoRpa(409, { estado: 'nada', motivo: 'sin_ofertas' }).texto, /no ha sacado ofertas/)
  assert.equal(vistaPresupuestoRpa(503, { estado: 'error' }).tono, 'error')
  assert.equal(vistaPresupuestoRpa(502, null).tono, 'error')
  assert.equal(vistaPresupuestoRpa(503, { estado: 'sin_configurar' }).texto, 'Falta ASEGURA_OPERADOR_SECRET en plataforma.')
})

test('401/403 es la sesión del usuario, no el secreto de operador', () => {
  assert.match(vistaPresupuestoRpa(401, { error: 'No autorizado' }).texto, /sesión/)
  assert.match(vistaPresupuestoRpa(403, null).texto, /sesión/)
})
