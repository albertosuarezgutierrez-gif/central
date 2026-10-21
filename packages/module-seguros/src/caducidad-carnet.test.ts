import test from 'node:test'
import assert from 'node:assert/strict'
import { caducidadCarnet, expedicionDesdeCaducidad } from './caducidad-carnet.ts'

test('coche/moto (B) antes de los 65: 10 años', () => {
  const r = caducidadCarnet({ fechaCarnet: '2020-03-15', fechaNacimiento: '1980-01-01', tipo: 'B' })
  assert.deepEqual(r, { fechaCaducidad: '2030-03-15', plazoAnios: 10, esTramoMayor: false })
})

test('coche/moto (B) con 65 exactos en la renovación: 5 años, no 10', () => {
  // Nace el 2020-03-15, cumple 65 ese mismo día: ya está en el tramo mayor.
  const r = caducidadCarnet({ fechaCarnet: '2020-03-15', fechaNacimiento: '1955-03-15', tipo: 'B' })
  assert.deepEqual(r, { fechaCaducidad: '2025-03-15', plazoAnios: 5, esTramoMayor: true })
})

test('un día antes de cumplir 65 todavía es tramo de 10 años', () => {
  const r = caducidadCarnet({ fechaCarnet: '2020-03-14', fechaNacimiento: '1955-03-15', tipo: 'B' })
  assert.deepEqual(r, { fechaCaducidad: '2030-03-14', plazoAnios: 10, esTramoMayor: false })
})

test('permiso profesional (C) antes de los 65: 5 años', () => {
  const r = caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: '1990-01-01', tipo: 'C' })
  assert.deepEqual(r, { fechaCaducidad: '2027-06-01', plazoAnios: 5, esTramoMayor: false })
})

test('permiso profesional (D1E) con 65+ años: 3 años', () => {
  const r = caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: '1950-01-01', tipo: 'D1E' })
  assert.deepEqual(r, { fechaCaducidad: '2025-06-01', plazoAnios: 3, esTramoMayor: true })
})

test('el tipo no distingue mayúsculas/minúsculas ni espacios', () => {
  const r = caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: '1990-01-01', tipo: ' c ' })
  assert.equal(r?.plazoAnios, 5)
})

test('tipo desconocido cae al tramo ligero (coche/moto)', () => {
  const r = caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: '1990-01-01', tipo: 'AM' })
  assert.equal(r?.plazoAnios, 10)
})

test('sin fecha de nacimiento no se calcula nada: null, no se adivina', () => {
  assert.equal(caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: null, tipo: 'B' }), null)
})

test('sin fecha de carné no se calcula nada', () => {
  assert.equal(caducidadCarnet({ fechaCarnet: undefined, fechaNacimiento: '1990-01-01', tipo: 'B' }), null)
})

test('una fecha que Date desliza (31 de febrero) se trata como ausente', () => {
  assert.equal(caducidadCarnet({ fechaCarnet: '2022-02-31', fechaNacimiento: '1990-01-01', tipo: 'B' }), null)
})

// ─── expedicionDesdeCaducidad: fechas RELATIVAS a hoy (nada de fechas fijas contra el reloj) ────────────────
const anioHoy = new Date().getUTCFullYear()
const dia = (anios: number, mmdd: string) => `${anioHoy + anios}-${mmdd}`

test('inversa, coche (B) joven: caducidad a 10 años → expedición 10 años antes', () => {
  const nac = dia(-40, '01-01')
  const exp = dia(-3, '03-15')
  const cad = caducidadCarnet({ fechaCarnet: exp, fechaNacimiento: nac, tipo: 'B' })!.fechaCaducidad
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: cad, fechaNacimiento: nac, tipo: 'B' }), exp)
})

test('inversa, ≥65 en la renovación → plazo de 5 años', () => {
  const nac = dia(-80, '05-10')
  const exp = dia(-2, '06-01') // 68 años
  const cad = caducidadCarnet({ fechaCarnet: exp, fechaNacimiento: nac, tipo: 'B' })!
  assert.equal(cad.plazoAnios, 5)
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: cad.fechaCaducidad, fechaNacimiento: nac, tipo: 'B' }), exp)
})

test('inversa, profesional: 5 años joven y 3 años a partir de 65', () => {
  const joven = { nac: dia(-35, '02-02'), exp: dia(-1, '07-07') }
  const cadJ = caducidadCarnet({ fechaCarnet: joven.exp, fechaNacimiento: joven.nac, tipo: 'C' })!.fechaCaducidad
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: cadJ, fechaNacimiento: joven.nac, tipo: 'c' }), joven.exp)
  const mayor = { nac: dia(-80, '02-02'), exp: dia(-1, '07-07') }
  const cadM = caducidadCarnet({ fechaCarnet: mayor.exp, fechaNacimiento: mayor.nac, tipo: 'D' })!
  assert.equal(cadM.plazoAnios, 3)
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: cadM.fechaCaducidad, fechaNacimiento: mayor.nac, tipo: 'D' }), mayor.exp)
})

test('inversa: sin nacimiento, o fechas no reales → null', () => {
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: dia(5, '03-15'), fechaNacimiento: null, tipo: 'B' }), null)
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: `${anioHoy + 5}-02-30`, fechaNacimiento: dia(-40, '01-01'), tipo: 'B' }), null)
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: '', fechaNacimiento: dia(-40, '01-01'), tipo: 'B' }), null)
})

test('inversa: un solo plazo cuadra por la edad (≥65 → 5 años, <65 → 10)', () => {
  const cad = dia(3, '03-15')
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: cad, fechaNacimiento: dia(-40, '01-01'), tipo: 'B' }), dia(-7, '03-15'))
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: cad, fechaNacimiento: dia(-80, '01-01'), tipo: 'B' }), dia(-2, '03-15'))
})

test('inversa: si cuadran DOS plazos (62 años a los 10 y 67 a los 5) es ambiguo → null', () => {
  const cad = dia(3, '03-15')
  // Expedición a 10 años = hace 7 años con 62 (plazo 10 válido); a 5 años = hace 2 con 67 (plazo 5 válido).
  assert.equal(expedicionDesdeCaducidad({ fechaCaducidad: cad, fechaNacimiento: dia(-69, '03-15'), tipo: 'B' }), null)
})

test('inversa: ida y vuelta siempre coherente con caducidadCarnet', () => {
  for (const [tipo, edad] of [['B', 30], ['B', 80], ['A2', 50], ['CE', 40], ['D1E', 80]] as const) {
    const nac = dia(-edad, '04-20')
    const exp = dia(-1, '09-09')
    const c = caducidadCarnet({ fechaCarnet: exp, fechaNacimiento: nac, tipo })!
    const r = expedicionDesdeCaducidad({ fechaCaducidad: c.fechaCaducidad, fechaNacimiento: nac, tipo })
    assert.equal(r, exp, `${tipo} ${edad}`)
  }
})
