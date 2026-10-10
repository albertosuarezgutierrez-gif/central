import { test } from 'node:test'
import assert from 'node:assert/strict'
import { corteSiniestros, textoCorteSiniestros, DIAS_CORTE_SINIESTROS, HORAS_CORTE_SINIESTROS } from './corte-siniestros.ts'

test('SIN callado > 7 días con POL/REC vivos: alerta', () => {
  const c = corteSiniestros({ porTipo: { POL: 5, REC: 10, SIN: 200 } })
  assert.equal(c.estado, 'alerta')
  if (c.estado === 'alerta') assert.deepEqual(c.vivos.map(v => v.tipo), ['POL', 'REC'])
})
test('SIN dentro del umbral: ok (borde 7 días inclusive; hueco normal de 5 días no alerta)', () => {
  assert.equal(DIAS_CORTE_SINIESTROS, 7)
  assert.equal(HORAS_CORTE_SINIESTROS, 168)
  assert.equal(corteSiniestros({ porTipo: { POL: 5, REC: 5, SIN: 168 } }).estado, 'ok')
  assert.equal(corteSiniestros({ porTipo: { POL: 5, REC: 5, SIN: 120 } }).estado, 'ok')
  assert.equal(corteSiniestros({ porTipo: { POL: 5, REC: 5, SIN: 169 } }).estado, 'alerta')
})
test('SIN ausente o tabla ausente: sin_dato, nunca ok ni 0', () => {
  assert.equal(corteSiniestros({ porTipo: { POL: 5, REC: 5 } }).estado, 'sin_dato')
  assert.equal(corteSiniestros({ porTipo: { POL: 5, REC: 5, SIN: null } }).estado, 'sin_dato')
  assert.equal(corteSiniestros({ porTipo: null }).estado, 'sin_dato')
})
test('parada general (POL y REC también viejos): ok; si no constan: sin_dato', () => {
  assert.equal(corteSiniestros({ porTipo: { POL: 200, REC: 200, SIN: 300 } }).estado, 'ok')
  assert.equal(corteSiniestros({ porTipo: { POL: null, REC: 200, SIN: 300 } }).estado, 'sin_dato')
})
test('basta con que uno de POL/REC viva; el otro ausente no lo impide', () => {
  assert.equal(corteSiniestros({ porTipo: { POL: 3, SIN: 200 } }).estado, 'alerta')
})
test('desglose por compañía: solo las que tienen el patrón', () => {
  const c = corteSiniestros({
    porTipo: { POL: 1, REC: 1, SIN: 200 },
    porEntidad: {
      C0468: { POL: 2, REC: 2, SIN: 200 },
      C0109: { POL: 2, REC: 2, SIN: 10 },
      C0058: { POL: 500, REC: 500, SIN: 600 },
      C0613: { POL: 2, SIN: null },
    },
  })
  assert.equal(c.estado, 'alerta')
  if (c.estado === 'alerta') assert.deepEqual(c.entidades.map(x => x.entidad), ['C0468', 'C0613'])
})
test('mensaje con dd/mm y días', () => {
  const c = corteSiniestros({ porTipo: { POL: 1, REC: 1, SIN: 240 } })
  assert.ok(c.estado === 'alerta')
  const t = textoCorteSiniestros(c, new Date('2026-10-03T10:00:00Z'))
  assert.match(t, /desde 23\/09 \(10 días/)
  assert.match(t, /pólizas\/recibos/)
})
