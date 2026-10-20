import test from 'node:test'
import assert from 'node:assert/strict'
import { leerSiniestro } from './siniestros-asegura.ts'
import { hayMasDatos } from './cima-extra-vista.ts'

const base = { id: 's1', polizaId: 'p1', estado: 'abierto' }
const extra = [{ ruta: 'Siniestro.DatosGenerales.CausaSiniestro', valor: 'Robo' }, { ruta: 'Siniestro.Otro', valor: '1900-01-01' }]

test('asegura vieja (campo ausente) → null y no truncado; nunca []', () => {
  const s = leerSiniestro(base)!
  assert.equal(s.cimaExtra, null)
  assert.equal(s.cimaExtraTruncado, false)
  assert.equal(hayMasDatos(s.cimaExtra), false)
})

test('null y forma rara → null; [] se conserva como «CIMA no trae más» y no pinta', () => {
  assert.equal(leerSiniestro({ ...base, cimaExtra: null })!.cimaExtra, null)
  assert.equal(leerSiniestro({ ...base, cimaExtra: 'x' })!.cimaExtra, null)
  const vacio = leerSiniestro({ ...base, cimaExtra: [] })!.cimaExtra
  assert.deepEqual(vacio, [])
  assert.equal(hayMasDatos(vacio), false)
})

test('con datos: agrupa, tapa el centinela y marca el truncado solo si es literalmente true', () => {
  const s = leerSiniestro({ ...base, cimaExtra: extra, cimaExtraTruncado: true })!
  assert.equal(hayMasDatos(s.cimaExtra), true)
  assert.deepEqual(s.cimaExtra, [{ titulo: 'Datos generales', filas: [{ etiqueta: 'Causa siniestro', valor: 'Robo' }] }])
  assert.equal(s.cimaExtraTruncado, true)
  assert.equal(leerSiniestro({ ...base, cimaExtra: extra, cimaExtraTruncado: 'true' })!.cimaExtraTruncado, false)
})
