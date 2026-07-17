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
