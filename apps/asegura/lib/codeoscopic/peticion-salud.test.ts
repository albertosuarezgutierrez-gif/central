import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPeticionSalud, revisarDatosSalud } from './peticion-salud.ts'
import type { DatosSalud } from './peticion-salud.ts'

const BASE: DatosSalud = {
  dni: '00000000t',
  nombre: 'Nombre',
  apellido1: 'Apellido',
  apellido2: 'Segundo',
  fechaNacimiento: '1985-01-01',
  sexo: 'hombre',
  estadoCivil: 'Single',
  telefono: '600000000',
  capital: 15000,
  fechaEfecto: '2026-09-15',
}
const LINEA = 'Health'

test('la MISMA persona va en holder y como único elemento de risk.insureds, e idéntica', () => {
  const c = construirPeticionSalud(BASE, LINEA) as any
  assert.deepEqual(c.risk.insureds, [c.holder])
  assert.equal(c.risk.insured, undefined)
  assert.equal(c.risk.capital, undefined)
})

test('sin capital SÍ se puede cotizar: no viaja, así que no se exige', () => {
  assert.equal(revisarDatosSalud({ ...BASE, capital: undefined as any }).some((x) => x.campo === 'capital'), false)
  assert.ok(revisarDatosSalud({ ...BASE, capital: -5 }).some((x) => x.campo === 'capital'))
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

// ─── Asegurados adicionales (03/10/2026) ─────────────────────────────────────
const HIJA = { nombre: 'Hija', apellido1: 'Apellido', fechaNacimiento: '2015-03-02', sexo: 'mujer' as const }

test('los adicionales viajan en risk.insureds DETRÁS del tomador, que sigue primero', () => {
  const c = construirPeticionSalud({ ...BASE, aseguradosAdicionales: [HIJA, { ...HIJA, nombre: 'Otro', sexo: 'hombre' }] }, LINEA) as any
  assert.equal(c.risk.insureds.length, 3)
  assert.deepEqual(c.risk.insureds[0], c.holder)
  assert.deepEqual(c.risk.insureds[1], { name: 'Hija', surname: 'Apellido', birthDate: '2015-03-02', gender: { id: 'Female' } })
  assert.equal(c.risk.insureds[2].gender.id, 'Male')
})

test('un adicional sin DNI no manda identificationDocument; con DNI sí, normalizado, y apellido2 obligatorio', () => {
  const sin = construirPeticionSalud({ ...BASE, aseguradosAdicionales: [HIJA] }, LINEA) as any
  assert.equal(sin.risk.insureds[1].identificationDocument, undefined)
  const con = construirPeticionSalud({ ...BASE, aseguradosAdicionales: [{ ...HIJA, apellido2: 'Segundo', dni: '00000000t' }] }, LINEA) as any
  assert.deepEqual(con.risk.insureds[1].identificationDocument, { type: { id: 'Dni' }, id: '00000000T' })
  assert.equal(con.risk.insureds[1].surname2, 'Segundo')
  assert.ok(revisarDatosSalud({ ...BASE, aseguradosAdicionales: [{ ...HIJA, dni: '00000000t' }] }).some((x) => /apellido2/.test(x.motivo)))
})

test('un adicional incompleto o con DNI mal formado se reclama ANTES de gastar', () => {
  const r = revisarDatosSalud({ ...BASE, aseguradosAdicionales: [{ ...HIJA, fechaNacimiento: '' , sexo: '' as never }, { ...HIJA, dni: '12345678A', apellido2: 'S' }] })
  const ms = r.filter((x) => x.campo === 'aseguradosAdicionales').map((x) => x.motivo)
  assert.ok(ms.some((m) => /asegurado adicional 1:.*fechaNacimiento.*sexo/.test(m)), ms.join('|'))
  assert.ok(ms.some((m) => /asegurado adicional 2:.*dni/.test(m)), ms.join('|'))
  assert.throws(() => construirPeticionSalud({ ...BASE, aseguradosAdicionales: [{ ...HIJA, nombre: '' }] }, LINEA), /codeoscopic_datos_incompletos/)
})

test('sin adicionales (o lista vacía) la petición es la de siempre: solo el tomador', () => {
  for (const aseguradosAdicionales of [undefined, null, []]) {
    const c = construirPeticionSalud({ ...BASE, aseguradosAdicionales }, LINEA) as any
    assert.deepEqual(c.risk.insureds, [c.holder])
  }
})
