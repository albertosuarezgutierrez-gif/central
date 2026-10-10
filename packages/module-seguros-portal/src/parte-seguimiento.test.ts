import assert from 'node:assert/strict'
import { test } from 'node:test'

import { indemnizadoDe, peritoAsignadoDe, seguimientoDeParte, type SiniestroParaSeguimiento } from './parte-seguimiento.ts'

const sin = (o: Partial<SiniestroParaSeguimiento> = {}): SiniestroParaSeguimiento => ({
  estado: 'abierto', referencia: null, peritoAsignado: null, indemnizado: null, ...o,
})

test('sin siniestro vinculado: «Recibido, lo estamos gestionando»', () => {
  for (const estadoParte of ['enviado', 'recibido']) {
    const r = seguimientoDeParte({ estadoParte, siniestro: null })
    assert.equal(r.paso, 'recibido')
    assert.equal(r.texto, 'Recibido, lo estamos gestionando')
    assert.equal(r.pasos.filter((p) => p.actual).length, 1)
    assert.deepEqual(r.pasos.filter((p) => p.hecho).map((p) => p.clave), ['recibido'])
  }
})

test('🚨 siniestro vinculado pero parte NO comunicado: no pasa de Recibido', () => {
  const r = seguimientoDeParte({ estadoParte: 'recibido', siniestro: sin({ estado: 'en_tramitacion', referencia: 'A1' }) })
  assert.equal(r.paso, 'recibido')
  assert.equal(r.referencia, null)
  assert.doesNotMatch(r.texto, /A1|tramitaci/)
})

test('comunicado: con y sin nº de siniestro', () => {
  const a = seguimientoDeParte({ estadoParte: 'abierto_en_compania', siniestro: sin({ referencia: ' 123/45 ' }) })
  assert.equal(a.paso, 'comunicado')
  assert.match(a.texto, /nº de siniestro 123\/45/)
  const b = seguimientoDeParte({ estadoParte: 'abierto_en_compania', siniestro: null })
  assert.equal(b.paso, 'comunicado')
  assert.equal(b.texto, 'Comunicado a tu compañía')
  assert.equal(seguimientoDeParte({ estadoParte: 'abierto_en_compania', siniestro: sin({ referencia: '  ' }) }).referencia, null)
})

test('en tramitación: perito asignado vs no se sabe (null ≠ «sin perito»)', () => {
  const con = seguimientoDeParte({ estadoParte: 'abierto_en_compania', siniestro: sin({ estado: 'en_tramitacion', peritoAsignado: true }) })
  assert.equal(con.paso, 'en_tramitacion')
  assert.match(con.texto, /perito asignado/)
  for (const p of [null, false]) {
    const r = seguimientoDeParte({ estadoParte: 'abierto_en_compania', siniestro: sin({ estado: 'en_tramitacion', peritoAsignado: p }) })
    assert.match(r.texto, /en gestión/)
    assert.doesNotMatch(r.texto, /sin perito|perito/)
  }
})

test('cerrado: indemnizado sí / no / null, y rechazado no se dice «cerrado» a secas', () => {
  const t = (indemnizado: boolean | null) =>
    seguimientoDeParte({ estadoParte: 'abierto_en_compania', siniestro: sin({ estado: 'cerrado', indemnizado }) })
  assert.match(t(true).texto, /con indemnización/)
  assert.match(t(false).texto, /sin indemnización/)
  assert.equal(t(null).texto, 'Cerrado')
  assert.equal(t(null).paso, 'cerrado')
  const rc = seguimientoDeParte({ estadoParte: 'abierto_en_compania', siniestro: sin({ estado: 'rechazado' }) })
  assert.equal(rc.rechazado, true)
  assert.match(rc.texto, /rechazado/)
  assert.equal(t(null).pasos.every((p) => p.hecho), true)
})

test('estado desconocido del siniestro → conservador (comunicado), no cerrado', () => {
  const r = seguimientoDeParte({ estadoParte: 'abierto_en_compania', siniestro: sin({ estado: 'raro' }) })
  assert.equal(r.paso, 'comunicado')
})

test('descartado: sin línea de pasos', () => {
  const r = seguimientoDeParte({ estadoParte: 'descartado', siniestro: sin({ estado: 'cerrado' }) })
  assert.equal(r.paso, 'descartado')
  assert.deepEqual(r.pasos, [])
  assert.match(r.texto, /escríbenos/)
})

test('🔒 no filtra campos internos aunque lleguen en la entrada', () => {
  const sucio = {
    estado: 'en_tramitacion', referencia: 'R-9', peritoAsignado: true, indemnizado: true,
    reservaCima: 12345.67, peritoNombre: 'Pepe Perito', tramitadorNombre: 'Ana Tramita',
    comentario: 'nota interna: sospecha de fraude', matriculaContraria: '1234ABC',
  } as unknown as SiniestroParaSeguimiento
  const r = seguimientoDeParte({ estadoParte: 'abierto_en_compania', siniestro: sucio })
  const json = JSON.stringify(r)
  for (const prohibido of ['12345', 'Pepe', 'Ana', 'fraude', '1234ABC', 'reserva', 'comentario']) {
    assert.ok(!json.includes(prohibido), `se coló ${prohibido}`)
  }
  assert.deepEqual(Object.keys(r).sort(), ['paso', 'pasos', 'rechazado', 'referencia', 'texto'])
})

test('indemnizadoDe / peritoAsignadoDe: null no se convierte en «no»', () => {
  assert.equal(indemnizadoDe(null, null), null)
  assert.equal(indemnizadoDe(0, null), false)
  assert.equal(indemnizadoDe(0, 50), true)
  assert.equal(indemnizadoDe(300, null), true)
  assert.equal(indemnizadoDe(null, 10), true)
  assert.equal(peritoAsignadoDe(null), null)
  assert.equal(peritoAsignadoDe(undefined), null)
  assert.equal(peritoAsignadoDe({ nombre: 'X' }), true)
})
