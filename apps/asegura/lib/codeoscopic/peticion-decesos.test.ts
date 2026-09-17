import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPeticionDecesos, revisarDatosDecesos } from './peticion-decesos.ts'
import type { DatosDecesos } from './peticion-decesos.ts'

const BASE: DatosDecesos = {
  dni: '00000000t',
  nombre: 'Nombre',
  apellido1: 'Apellido',
  fechaNacimiento: '1985-01-01',
  sexo: 'hombre',
  estadoCivil: 'Single',
  telefono: '600000000',
  capital: 3000,
  fechaEfecto: '2026-09-15',
}
const LINEA = 'Burial'

test('la MISMA persona va en holder y risk.insured, e idéntica', () => {
  const c = construirPeticionDecesos(BASE, LINEA) as any
  assert.deepEqual(c.holder, c.risk.insured)
})

test('sin capital no se puede cotizar', () => {
  assert.ok(revisarDatosDecesos({ ...BASE, capital: undefined as any }).some((x) => x.campo === 'capital'))
})

test('unos datos válidos no dan ningún reparo', () => {
  assert.deepEqual(revisarDatosDecesos(BASE), [])
})

test('construir con datos incompletos LANZA y nombra los campos', () => {
  assert.throws(
    () => construirPeticionDecesos({ ...BASE, fechaEfecto: '' }, LINEA),
    /codeoscopic_datos_incompletos[\s\S]*fechaEfecto/,
  )
})

test('el ramo va con el id EXACTO que se le pasa, y la referencia nuestra solo si la hay', () => {
  const sin = construirPeticionDecesos(BASE, LINEA) as any
  assert.deepEqual(sin.insuranceLine, { id: 'Burial' })
  assert.equal(sin.externalId, undefined)
  const con = construirPeticionDecesos({ ...BASE, referenciaExterna: 'cot-000002' }, LINEA) as any
  assert.equal(con.externalId, 'cot-000002')
})
