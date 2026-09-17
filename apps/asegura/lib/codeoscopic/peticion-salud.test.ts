import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPeticionSalud, revisarDatosSalud } from './peticion-salud.ts'
import type { DatosSalud } from './peticion-salud.ts'

const BASE: DatosSalud = {
  dni: '00000000t',
  nombre: 'Nombre',
  apellido1: 'Apellido',
  fechaNacimiento: '1985-01-01',
  sexo: 'hombre',
  estadoCivil: 'Single',
  telefono: '600000000',
  capital: 15000,
  fechaEfecto: '2026-09-15',
}
const LINEA = 'Health'

test('la MISMA persona va en holder y risk.insured, e idéntica', () => {
  const c = construirPeticionSalud(BASE, LINEA) as any
  assert.deepEqual(c.holder, c.risk.insured)
})

test('sin capital no se puede cotizar', () => {
  assert.ok(revisarDatosSalud({ ...BASE, capital: undefined as any }).some((x) => x.campo === 'capital'))
})

test('modalidadDeseada NUNCA viaja al vendor: no hay campo confirmado', () => {
  const json = JSON.stringify(construirPeticionSalud({ ...BASE, modalidadDeseada: 'Premium con dental' }, LINEA))
  assert.ok(!json.includes('Premium con dental'))
})

test('unos datos válidos no dan ningún reparo', () => {
  assert.deepEqual(revisarDatosSalud(BASE), [])
})

test('construir con datos incompletos LANZA y nombra los campos', () => {
  assert.throws(
    () => construirPeticionSalud({ ...BASE, telefono: '' }, LINEA),
    /codeoscopic_datos_incompletos[\s\S]*telefono/,
  )
})

test('el ramo va con el id EXACTO que se le pasa, y la referencia nuestra solo si la hay', () => {
  const sin = construirPeticionSalud(BASE, LINEA) as any
  assert.deepEqual(sin.insuranceLine, { id: 'Health' })
  assert.equal(sin.externalId, undefined)
  const con = construirPeticionSalud({ ...BASE, referenciaExterna: 'cot-000001' }, LINEA) as any
  assert.equal(con.externalId, 'cot-000001')
})
