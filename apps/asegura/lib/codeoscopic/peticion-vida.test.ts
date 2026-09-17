import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPeticionVida, revisarDatosVida } from './peticion-vida.ts'
import type { DatosVida } from './peticion-vida.ts'

// Datos mínimos válidos. Persona inventada: aquí no entra ningún cliente real.
const BASE: DatosVida = {
  dni: '00000000t',
  nombre: 'Nombre',
  apellido1: 'Apellido',
  fechaNacimiento: '1985-01-01',
  sexo: 'hombre',
  estadoCivil: 'Single',
  telefono: '600000000',
  capital: 30000,
  fechaEfecto: '2026-09-15',
}
const LINEA = 'TermLife'

test('la MISMA persona va en holder y risk.insured, e idéntica', () => {
  const c = construirPeticionVida(BASE, LINEA) as any
  assert.deepEqual(c.holder, c.risk.insured)
})

test('el capital viaja tal cual, en euros', () => {
  const c = construirPeticionVida(BASE, LINEA) as any
  assert.equal(c.risk.capital, 30000)
})

test('sin capital no se puede cotizar', () => {
  const r = revisarDatosVida({ ...BASE, capital: undefined as any })
  assert.ok(r.some((x) => x.campo === 'capital'))
})

test('capital a 0 o negativo se rechaza (no es un importe válido)', () => {
  assert.ok(revisarDatosVida({ ...BASE, capital: 0 }).some((x) => x.campo === 'capital'))
  assert.ok(revisarDatosVida({ ...BASE, capital: -100 }).some((x) => x.campo === 'capital'))
})

test('duración es opcional, y solo viaja si es un número', () => {
  const sin = construirPeticionVida(BASE, LINEA) as any
  assert.equal(sin.risk.durationYears, undefined)
  const con = construirPeticionVida({ ...BASE, duracionAnios: 10 }, LINEA) as any
  assert.equal(con.risk.durationYears, 10)
})

test('unos datos válidos no dan ningún reparo', () => {
  assert.deepEqual(revisarDatosVida(BASE), [])
})

test('construir con datos incompletos LANZA y nombra los campos', () => {
  assert.throws(
    () => construirPeticionVida({ ...BASE, dni: '' }, LINEA),
    /codeoscopic_datos_incompletos[\s\S]*dni/,
  )
})

test('el ramo va con el id EXACTO que se le pasa, y la referencia nuestra solo si la hay', () => {
  const sin = construirPeticionVida(BASE, LINEA) as any
  assert.deepEqual(sin.insuranceLine, { id: 'TermLife' })
  assert.equal(sin.externalId, undefined)
  const con = construirPeticionVida({ ...BASE, referenciaExterna: 'cot-000000' }, LINEA) as any
  assert.equal(con.externalId, 'cot-000000')
})
