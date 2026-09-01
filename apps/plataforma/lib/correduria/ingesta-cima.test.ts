import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarIngesta, saludDesdeRespuesta } from './ingesta-cima.ts'

const OK = {
  estado: 'ok',
  cuarentena: [
    { tipo: 'SIN', entidad: 'C0468', dias: 2 },
    { tipo: 'REC', entidad: 'C0468', dias: 60 },
  ],
  huerfanas: 19,
  primaPerdida: 7721.71,
  diasSinPersistir: { POL: 7, REC: 8, SIN: 61, CEF: null },
}

test('respuesta buena: degradada, con la prima y la compañía señaladas', () => {
  const r = interpretarIngesta(200, OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.estado, 'degradada')
  assert.equal(r.salud.total, 2)
  assert.equal(r.salud.recientes, 1)
  assert.equal(r.salud.huerfanas, 19)
  assert.equal(r.salud.primaPerdida, 7721.71)
  assert.equal(r.salud.porEntidad[0].entidad, 'C0468')
  assert.match(r.salud.motivos.join(' '), /SIN: 61 días sin guardar/)
})

test('«sin configurar» y «error» NO se confunden entre sí', () => {
  assert.deepEqual(interpretarIngesta(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarIngesta(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarIngesta(401, {}), { estado: 'error', motivo: 'secreto_rechazado' })
})

test('🚨 una respuesta rota degrada a «no se ha podido mirar», nunca a «no hay nada atascado»', () => {
  for (const rota of [
    { estado: 'ok' },
    { estado: 'ok', cuarentena: 'muchos' },
    { estado: 'ok', cuarentena: [{ tipo: 'SIN' }] },
    null,
  ]) {
    const r = interpretarIngesta(200, rota)
    assert.equal(r.estado, 'error', JSON.stringify(rota))
    assert.equal(saludDesdeRespuesta(r).estado, 'sin_datos')
  }
})

test('cuarentena vacía sí es «comprobado que no hay»', () => {
  const r = interpretarIngesta(200, { estado: 'ok', cuarentena: [], huerfanas: 0 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.estado, 'ok')
  assert.equal(r.salud.total, 0)
})

test('un fallo de red se convierte en sin_datos, no en silencio', () => {
  assert.equal(saludDesdeRespuesta({ estado: 'error', motivo: 'red' }).estado, 'sin_datos')
  assert.equal(saludDesdeRespuesta({ estado: 'sin_configurar' }).estado, 'sin_datos')
})

test('los campos opcionales ausentes son null, no cero', () => {
  const r = interpretarIngesta(200, { estado: 'ok', cuarentena: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.huerfanas, null)
  assert.equal(r.salud.primaPerdida, null)
})
