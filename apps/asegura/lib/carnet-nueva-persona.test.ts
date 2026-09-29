import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { carnetDeNuevaPersona } from './carnet-nueva-persona.ts'

const HOY = '2026-09-29'

test('sin carné: la persona se da de alta como hasta ahora', () => {
  assert.deepEqual(carnetDeNuevaPersona({ nombre: 'Ana' }, HOY), { ok: true, carnet: null })
  assert.deepEqual(carnetDeNuevaPersona({ fechaCarnet: '  ' }, HOY), { ok: true, carnet: null })
})

test('con fecha y sin tipo: es el B', () => {
  assert.deepEqual(carnetDeNuevaPersona({ fechaCarnet: '2010-05-04', fechaNacimiento: '1990-01-01' }, HOY), {
    ok: true,
    carnet: { tipo: 'B', fecha: '2010-05-04' },
  })
})

test('la fecha dictada por Telegram (dd/mm/aaaa) se guarda en ISO', () => {
  assert.deepEqual(carnetDeNuevaPersona({ fechaCarnet: '04/05/2010', fechaNacimiento: '01/01/1990' }, HOY), {
    ok: true,
    carnet: { tipo: 'B', fecha: '2010-05-04' },
  })
})

test('moto: el tipo que se elige viaja normalizado', () => {
  const r = carnetDeNuevaPersona({ fechaCarnet: '2015-03-02', tipoCarnet: ' a2 ' }, HOY)
  assert.deepEqual(r, { ok: true, carnet: { tipo: 'A2', fecha: '2015-03-02' } })
})

test('un carné que viene mal NO se ignora: se rechaza', () => {
  for (const [p, m] of [
    [{ fechaCarnet: '4-5-2010' }, /aaaa-mm-dd/],
    [{ fechaCarnet: '2010-02-30' }, /aaaa-mm-dd/],
    [{ fechaCarnet: '2027-01-01' }, /futura/],
    [{ fechaCarnet: '2010-05-04', tipoCarnet: 'C' }, /desconocido/],
    [{ tipoCarnet: 'A2' }, /falta la fecha/],
    // La fecha de nacimiento tecleada en el campo del carné: salta por la edad.
    [{ fechaCarnet: '1990-01-01', fechaNacimiento: '1990-01-01' }, /antes de cumplir 15/],
  ] as const) {
    const r = carnetDeNuevaPersona(p as Record<string, unknown>, HOY)
    assert.equal(r.ok, false, JSON.stringify(p))
    assert.match((r as { motivo: string }).motivo, m)
  }
})

test('el día que cumple 15 ya vale (AM)', () => {
  assert.equal(carnetDeNuevaPersona({ fechaCarnet: '2005-06-10', fechaNacimiento: '1990-06-10', tipoCarnet: 'AM' }, HOY).ok, true)
})

test('el alta del riesgo valida el carné ANTES de crear la ficha y nunca pisa uno que ya tenga', () => {
  const src = readFileSync(new URL('./oportunidad-riesgo.ts', import.meta.url), 'utf8')
  const i = src.indexOf('export async function nuevaPersonaEnRiesgo')
  const cuerpo = src.slice(i, src.indexOf('\nexport ', i + 10))
  assert.ok(cuerpo.indexOf('carnetDeNuevaPersona(') < cuerpo.indexOf('altaCliente('), 'el carné se valida después del alta')
  assert.match(cuerpo, /insert into seguros\.cliente_carnets_conducir/)
  assert.match(cuerpo, /where not exists/)
  assert.match(cuerpo, /encryptField\(/)
})
