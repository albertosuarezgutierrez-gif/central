import test from 'node:test'
import assert from 'node:assert/strict'
import { claveTipoCarnet, fechaExpedicionDeEntrada, revisarCarnet } from './carnet-ficha.ts'

const HOY = '2026-09-29'

test('carné válido: tipo normalizado y fecha tal cual', () => {
  assert.deepEqual(revisarCarnet({ tipo: ' b ', fecha: '1990-05-04', fechaNacimiento: '1954-05-30', hoy: HOY }), {
    ok: true,
    tipo: 'B',
    fecha: '1990-05-04',
  })
})

test('acepta dd/mm/aaaa', () => {
  const r = revisarCarnet({ tipo: 'A2', fecha: '04/05/2019', fechaNacimiento: null, hoy: HOY })
  assert.deepEqual(r, { ok: true, tipo: 'A2', fecha: '2019-05-04' })
})

test('tipo desconocido o vacío se rechaza', () => {
  assert.equal(revisarCarnet({ tipo: 'X', fecha: '2000-01-01', fechaNacimiento: null, hoy: HOY }).ok, false)
  const r = revisarCarnet({ tipo: '', fecha: '2000-01-01', fechaNacimiento: null, hoy: HOY })
  assert.equal(r.ok === false && r.campo, 'tipo')
})

test('fecha vacía, irreal o futura se rechaza', () => {
  for (const fecha of ['', '2021-02-30', 'ayer', '2026-09-30']) {
    const r = revisarCarnet({ tipo: 'B', fecha, fechaNacimiento: null, hoy: HOY })
    assert.equal(r.ok === false && r.campo, 'fecha', fecha)
  }
})

test('antes de cumplir 15 es un error de tecleo; el día que los cumple, no', () => {
  assert.equal(revisarCarnet({ tipo: 'AM', fecha: '1969-05-29', fechaNacimiento: '1954-05-30', hoy: HOY }).ok, false)
  assert.equal(revisarCarnet({ tipo: 'AM', fecha: '1969-05-30', fechaNacimiento: '1954-05-30', hoy: HOY }).ok, true)
})

test('sin nacimiento legible no se comprueba la edad', () => {
  assert.equal(revisarCarnet({ tipo: 'B', fecha: '1950-01-01', fechaNacimiento: null, hoy: HOY }).ok, true)
})

test('claveTipoCarnet iguala mayúsculas y espacios', () => {
  assert.equal(claveTipoCarnet('c1 e'), 'C1E')
  assert.equal(claveTipoCarnet(null), '')
})

// ─── fechaExpedicionDeEntrada (caducidad del anverso → expedición) ───────────────────────────────────────────
const ANIO = new Date().getUTCFullYear()

test('con fecha de expedición manda ella, aunque venga también caducidad', () => {
  assert.deepEqual(fechaExpedicionDeEntrada({ tipo: 'B', fecha: '2015-01-01', fechaCaducidad: `${ANIO + 3}-01-01`, fechaNacimiento: null }), {
    ok: true,
    fecha: '2015-01-01',
    viaCaducidad: false,
  })
})

test('solo caducidad: se deduce la expedición (también en dd/mm/aaaa) y con nacimiento', () => {
  const nac = `${ANIO - 40}-01-01`
  const r = fechaExpedicionDeEntrada({ tipo: 'b', fecha: undefined, fechaCaducidad: `15/03/${ANIO + 3}`, fechaNacimiento: nac })
  assert.deepEqual(r, { ok: true, fecha: `${ANIO - 7}-03-15`, viaCaducidad: true })
})

test('solo caducidad sin nacimiento → motivo claro; fecha imposible → no válida', () => {
  const sin = fechaExpedicionDeEntrada({ tipo: 'B', fecha: '', fechaCaducidad: `${ANIO + 3}-03-15`, fechaNacimiento: null })
  assert.equal(sin.ok, false)
  assert.match(sin.ok ? '' : sin.motivo, /apartado 4a\/10/)
  const mala = fechaExpedicionDeEntrada({ tipo: 'B', fecha: '', fechaCaducidad: `${ANIO + 3}-02-30`, fechaNacimiento: `${ANIO - 40}-01-01` })
  assert.equal(mala.ok, false)
})

test('sin ninguna de las dos → pasa tal cual y revisarCarnet dirá «Falta la fecha»', () => {
  const r = fechaExpedicionDeEntrada({ tipo: 'B', fecha: undefined, fechaCaducidad: undefined, fechaNacimiento: null })
  assert.deepEqual(r, { ok: true, fecha: undefined, viaCaducidad: false })
})
