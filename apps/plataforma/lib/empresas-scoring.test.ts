// Tests del scoring de empresa. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puntuarEmpresa } from './empresas-scoring.ts'

const base = { empresa: 'X SL', empresaNorm: 'X', provincia: 'Sevilla' }

test('concurso pesa mucho', () => {
  const r = puntuarEmpresa({ ...base, eventos: [{ tipo: 'concurso', fecha: '2026-07-01' }] })
  assert.ok(r.score >= 70)
  assert.match(r.motivo, /concurso/i)
})

test('sin señales duras, score bajo', () => {
  const r = puntuarEmpresa({ ...base, eventos: [{ tipo: 'cese', fecha: '2026-07-01' }] })
  assert.ok(r.score < 40)
})

test('acumula señales distintas', () => {
  const dos = puntuarEmpresa({ ...base, eventos: [
    { tipo: 'concurso', fecha: '2026-07-01' }, { tipo: 'disolucion', fecha: '2026-07-02' }] })
  const uno = puntuarEmpresa({ ...base, eventos: [{ tipo: 'concurso', fecha: '2026-07-01' }] })
  assert.ok(dos.score > uno.score)
})

test('mismo tipo repetido no infla el score', () => {
  const r = puntuarEmpresa({ ...base, eventos: [
    { tipo: 'concurso', fecha: '2026-07-01' }, { tipo: 'concurso', fecha: '2026-07-05' }] })
  assert.equal(r.score, 70)
})

test('sin bloque financiero, el score no cambia (retrocompatible)', () => {
  const r = puntuarEmpresa({ ...base, eventos: [{ tipo: 'ampliacion_capital', fecha: '2026-07-01' }] })
  assert.equal(r.score, 20)
})

test('señales financieras suman y salen en el motivo', () => {
  const r = puntuarEmpresa({
    ...base,
    eventos: [{ tipo: 'ampliacion_capital', fecha: '2026-07-01' }],
    financiero: { patrimonioNetoNegativo: true, incidenciasPago: true },
  })
  assert.ok(r.score > 20)
  assert.match(r.motivo, /patrimonio neto negativo/)
  assert.match(r.motivo, /RAI\/ASNEF/)
})

test('umbrales: retraso >12m y deuda/EBITDA >6x', () => {
  const dentro = puntuarEmpresa({ ...base, eventos: [], financiero: { cuentasRetrasoMeses: 10, deudaEbitda: 5 } })
  assert.equal(dentro.score, 0)
  const fuera = puntuarEmpresa({ ...base, eventos: [], financiero: { cuentasRetrasoMeses: 18, deudaEbitda: 8 } })
  assert.ok(fuera.score > 0)
  assert.match(fuera.motivo, />12 meses/)
  assert.match(fuera.motivo, /deuda\/EBITDA >6/)
})

test('score compuesto se satura en 100', () => {
  const r = puntuarEmpresa({
    ...base,
    eventos: [{ tipo: 'concurso', fecha: '2026-07-01' }, { tipo: 'disolucion', fecha: '2026-07-02' }],
    financiero: { patrimonioNetoNegativo: true, incidenciasPago: true, ebitdaNegativo2Anios: true },
  })
  assert.equal(r.score, 100)
})
