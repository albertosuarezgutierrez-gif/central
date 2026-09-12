import test from 'node:test'
import assert from 'node:assert/strict'
import { MODALIDADES_RC, etiquetaModalidadRc, tituloModalidadRc, validarModalidadRc } from './rc-modalidad.ts'

test('valida una modalidad conocida sin nota', () => {
  const v = validarModalidadRc('explotacion')
  assert.deepEqual(v, { ok: true, id: 'explotacion', nota: null })
})

test('recorta la nota y la conserva', () => {
  const v = validarModalidadRc('locativa', '  del local de la calle Betis  ')
  assert.deepEqual(v, { ok: true, id: 'locativa', nota: 'del local de la calle Betis' })
})

test('rechaza un id fuera del catálogo: no se acepta texto libre disfrazado de id', () => {
  const v = validarModalidadRc('inventada')
  assert.equal(v.ok, false)
})

test('rechaza vacío', () => {
  assert.equal(validarModalidadRc('').ok, false)
  assert.equal(validarModalidadRc(undefined).ok, false)
})

test('"otra" SIN nota no vale: sería un "no informado" con más pasos', () => {
  const v = validarModalidadRc('otra')
  assert.equal(v.ok, false)
})

test('"otra" CON nota sí vale', () => {
  const v = validarModalidadRc('otra', 'RC de caza mayor')
  assert.deepEqual(v, { ok: true, id: 'otra', nota: 'RC de caza mayor' })
})

test('etiquetaModalidadRc: null para un id que no existe', () => {
  assert.equal(etiquetaModalidadRc('no-existe'), null)
  assert.equal(etiquetaModalidadRc('patronal'), 'RC Patronal (accidentes de trabajo)')
})

test('tituloModalidadRc: junta etiqueta y nota, salvo en "otra" donde la nota manda sola', () => {
  assert.equal(tituloModalidadRc('profesional', null), 'RC Profesional')
  assert.equal(tituloModalidadRc('profesional', 'de un arquitecto'), 'RC Profesional · de un arquitecto')
  assert.equal(tituloModalidadRc('otra', 'RC de caza mayor'), 'RC de caza mayor')
  assert.equal(tituloModalidadRc('no-existe', null), null)
})

test('el catálogo no tiene ids repetidos', () => {
  const ids = MODALIDADES_RC.map((m) => m.id)
  assert.equal(new Set(ids).size, ids.length)
})
