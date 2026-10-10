import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPeticionVida, revisarDatosVida } from './peticion-vida.ts'
import type { DatosVida } from './peticion-vida.ts'

// Datos mínimos válidos. Persona inventada: aquí no entra ningún cliente real.
const BASE: DatosVida = {
  dni: '00000000t',
  nombre: 'Nombre',
  apellido1: 'Apellido',
  apellido2: 'Segundo',
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

test('el capital viaja como deathBenefit, en euros, y no como capital', () => {
  const c = construirPeticionVida(BASE, LINEA) as any
  assert.equal(c.risk.deathBenefit, 30000)
  assert.equal(c.risk.capital, undefined)
})

test('sin capital no se puede cotizar', () => {
  const r = revisarDatosVida({ ...BASE, capital: undefined as any })
  assert.ok(r.some((x) => x.campo === 'capital'))
})

test('capital a 0 o negativo se rechaza (no es un importe válido)', () => {
  assert.ok(revisarDatosVida({ ...BASE, capital: 0 }).some((x) => x.campo === 'capital'))
  assert.ok(revisarDatosVida({ ...BASE, capital: -100 }).some((x) => x.campo === 'capital'))
})

test('la duración NO viaja: TermLifeRisk_V1 no documenta ese campo', () => {
  const con = construirPeticionVida({ ...BASE, duracionAnios: 10 }, LINEA) as any
  assert.deepEqual(Object.keys(con.risk).sort(), ['deathBenefit', 'insured'])
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

// ─── Profesión y fumador en el asegurado (03/10/2026) ────────────────────────
test('la profesión viaja como insured.economicOccupation.code y el tabaco como insured.smoker, solo en el asegurado', () => {
  const c = construirPeticionVida({ ...BASE, profesion: '2612', fumador: false }, LINEA) as any
  assert.deepEqual(c.risk.insured.economicOccupation, { code: '2612' })
  assert.equal(c.risk.insured.smoker, false, 'fumador=false es una respuesta y se manda')
  assert.equal(c.holder.economicOccupation, undefined, 'el tomador no lleva profesión')
  assert.equal(c.holder.smoker, undefined)
  assert.equal(c.risk.insured.name, c.holder.name, 'sigue siendo la misma persona base')
})

test('sin profesión ni fumador (null/ausente) no se manda NADA: jamás un «no fuma» por defecto', () => {
  for (const extra of [{}, { profesion: null, fumador: null }, { profesion: '  ' }]) {
    const c = construirPeticionVida({ ...BASE, ...extra }, LINEA) as any
    assert.equal('economicOccupation' in c.risk.insured, false)
    assert.equal('smoker' in c.risk.insured, false)
  }
  assert.deepEqual(construirPeticionVida(BASE, LINEA).holder, (construirPeticionVida(BASE, LINEA) as any).risk.insured)
})

test('la profesión tiene que ser un código CNO-11 de 1 a 4 cifras; fumador, sí/no', () => {
  assert.ok(revisarDatosVida({ ...BASE, profesion: 'médico' }).some((x) => x.campo === 'profesion'))
  assert.ok(revisarDatosVida({ ...BASE, profesion: '26120' }).some((x) => x.campo === 'profesion'))
  assert.deepEqual(revisarDatosVida({ ...BASE, profesion: '2612' }), [])
  assert.ok(revisarDatosVida({ ...BASE, fumador: 'si' as never }).some((x) => x.campo === 'fumador'))
})

test('peso y altura NO viajan (formato sin documentar), aunque lleguen en los datos', () => {
  const c = construirPeticionVida({ ...BASE, peso: 80, altura: 180, weight: 80, height: 180 } as any, LINEA) as any
  for (const k of ['weight', 'height', 'peso', 'altura']) assert.equal(k in c.risk.insured, false, k)
})

test('CNO: solo 4 cifras (catálogo level=4)', () => {
  for (const p of ['1', '26', '261']) assert.ok(revisarDatosVida({ ...BASE, profesion: p }).some((x) => x.campo === 'profesion'), p)
})
