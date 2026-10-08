import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precalificarVidaNueva } from './desde-cartera-vida.ts'
import { precalificarSaludNueva } from './desde-cartera-salud.ts'
import { precalificarDecesosNueva } from './desde-cartera-decesos.ts'
import { construirPeticionVida } from './peticion-vida.ts'
import { construirPeticionSalud } from './peticion-salud.ts'
import type { ClienteCartera } from './desde-cartera.ts'

const CLIENTE = {
  nombre: 'Nombre', apellidos: 'Apellido Segundo', dni: '00000000T', telefono: '600000000',
  fechaNacimiento: '1985-01-01', estadoCivil: null, saludo: '1', codigoPostal: null, fechaCarnet: null,
} as ClienteCartera

test('vida: la profesión y el tabaco tecleados llegan a los datos; sin ellos, NO se suponen', () => {
  const sin = precalificarVidaNueva(CLIENTE, { estadoCivilId: 'Single', capital: 30000, duracionAnios: null }, '2026-10-03')
  assert.equal(sin.datos.profesion, undefined)
  assert.equal(sin.datos.fumador, undefined, 'nunca fumador=false por defecto')
  assert.deepEqual(sin.faltan, [])

  const con = precalificarVidaNueva(CLIENTE, { estadoCivilId: 'Single', capital: 30000, duracionAnios: null, profesion: '2612', fumador: false }, '2026-10-03')
  assert.equal(con.datos.profesion, '2612')
  assert.equal(con.datos.fumador, false)
  const c = construirPeticionVida(con.datos as never, 'TermLife') as any
  assert.deepEqual(c.risk.insured.economicOccupation, { code: '2612' })
  assert.equal(c.risk.insured.smoker, false)
})

test('salud y decesos: los asegurados tecleados llegan a aseguradosAdicionales y de ahí a insureds[]', () => {
  const adicional = { nombre: 'Hija', apellido1: 'Apellido', fechaNacimiento: '2015-03-02', sexo: 'mujer' as const }
  const s = precalificarSaludNueva(CLIENTE, { estadoCivilId: 'Single', capital: null, modalidadDeseada: null, asegurados: [adicional] }, '2026-10-03')
  assert.deepEqual(s.datos.aseguradosAdicionales, [adicional])
  assert.equal(s.faltan.length, 0)
  const peticion = construirPeticionSalud(s.datos as never, 'Health') as any
  assert.equal(peticion.risk.insureds.length, 2)

  const d = precalificarDecesosNueva(CLIENTE, { estadoCivilId: 'Single', capital: null, asegurados: [adicional] }, '2026-10-03')
  assert.deepEqual(d.datos.aseguradosAdicionales, [adicional])

  const sinNada = precalificarSaludNueva(CLIENTE, { estadoCivilId: 'Single', capital: null, modalidadDeseada: null }, '2026-10-03')
  assert.equal(sinNada.datos.aseguradosAdicionales, undefined)
})

test('un adicional incompleto sale en faltan de la precalificación, sin gastar', () => {
  const s = precalificarSaludNueva(CLIENTE, { estadoCivilId: 'Single', capital: null, modalidadDeseada: null, asegurados: [{ nombre: 'X', apellido1: '', fechaNacimiento: '', sexo: 'mujer' }] }, '2026-10-03')
  assert.ok(s.faltan.some((f) => f.campo === 'aseguradosAdicionales' && /asegurado adicional 1/.test(f.motivo)))
})
