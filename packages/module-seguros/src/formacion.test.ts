import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clavePersona, resumenFormacion, validarAltaFormacion } from './formacion.ts'

test('suma las horas del año por persona (misma persona escrita distinto) y dice cuántas faltan', () => {
  const r = resumenFormacion(
    [
      { persona: 'Alberto Suárez', horas: 10, fecha: '2026-03-01' },
      { persona: 'alberto  suarez', horas: 2.5, fecha: '2026-05-01' },
      { persona: 'Alberto Suárez', horas: 20, fecha: '2025-05-01' },
    ],
    2026,
    '2026-06-01',
  )
  assert.equal(r.personas.length, 1)
  assert.deepEqual(r.personas[0], { persona: 'Alberto Suárez', horas: 12.5, faltan: 2.5, estado: 'en_curso' })
  assert.equal(r.pendientes, 0)
})

test('🪤 quien se formó el año pasado y este no, sale con 0 horas (no desaparece)', () => {
  const r = resumenFormacion([{ persona: 'Ana', horas: 15, fecha: '2025-02-01' }], 2026, '2026-10-02')
  assert.deepEqual(r.personas[0], { persona: 'Ana', horas: 0, faltan: 15, estado: 'atrasado' })
  assert.equal(r.pendientes, 1)
})

test('🪤 año cerrado sin las horas = incumplido; con ellas = cumplido', () => {
  const r = resumenFormacion(
    [
      { persona: 'Ana', horas: 5, fecha: '2025-02-01' },
      { persona: 'Luis', horas: 15, fecha: '2025-12-31' },
    ],
    2025,
    '2026-01-10',
  )
  assert.equal(r.personas.find((p) => p.persona === 'Ana')!.estado, 'incumplido')
  assert.equal(r.personas.find((p) => p.persona === 'Luis')!.estado, 'cumplido')
})

test('una persona que solo aparece en años POSTERIORES no cuenta para un año pasado', () => {
  const r = resumenFormacion([{ persona: 'Nueva', horas: 3, fecha: '2026-02-01' }], 2025, '2026-06-01')
  assert.equal(r.personas.length, 0)
})

test('valida el alta: fecha futura, horas imposibles y campos vacíos se rechazan juntos', () => {
  const mal = validarAltaFormacion({ persona: '', curso: '', fecha: '2026-12-01', horas: -1 }, '2026-06-01')
  assert.equal(mal.ok, false)
  if (!mal.ok) assert.equal(mal.motivos.length, 4)
  const bien = validarAltaFormacion({ persona: ' Ana ', curso: 'IDD anual', fecha: '2026-05-01', horas: '7,5' }, '2026-06-01')
  assert.deepEqual(bien, { ok: true, valor: { persona: 'Ana', curso: 'IDD anual', entidad: null, fecha: '2026-05-01', horas: 7.5 } })
})

test('clavePersona funde tildes, mayúsculas y espacios', () => {
  assert.equal(clavePersona('  José  PÉREZ '), 'jose perez')
})

test('🪤 horas con decimales corrientes (2,3 · 1.1 · 8,25) se aceptan; con 3 decimales, no', () => {
  for (const h of ['2,3', 1.1, '8,25', 2.55]) {
    assert.equal(validarAltaFormacion({ persona: 'Ana', curso: 'X', fecha: '2026-05-01', horas: h }, '2026-06-01').ok, true, String(h))
  }
  assert.equal(validarAltaFormacion({ persona: 'Ana', curso: 'X', fecha: '2026-05-01', horas: '1,234' }, '2026-06-01').ok, false)
})

test('🪤 una fecha imposible (31 de febrero) se rechaza en vez de llegar a la BD', () => {
  assert.equal(validarAltaFormacion({ persona: 'Ana', curso: 'X', fecha: '2026-02-31', horas: 2 }, '2026-06-01').ok, false)
})
