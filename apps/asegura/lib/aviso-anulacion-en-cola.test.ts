import test from 'node:test'
import assert from 'node:assert/strict'
import { efectoRetroactivo, textoAvisoAnulacionEnCola } from './aviso-anulacion-en-cola.ts'

const base = { tomador: 'Ana <Pérez>', compania: 'Occident', numeroPoliza: 'P-123', tipo: 'inmediata', fechaEfecto: '2026-10-20', firmadaEl: '2026-10-12', caducaEl: '2026-10-19' }

test('aviso con todos los datos y sin retroactivo', () => {
  const t = textoAvisoAnulacionEnCola(base)
  assert.match(t, /Ana &lt;Pérez&gt; · Occident · nº P-123/)
  assert.match(t, /baja inmediata · efecto 20\/10\/2026/)
  assert.match(t, /Caduca el 19\/10\/2026/)
  assert.match(t, /plataforma \/correduria → Hoy/)
  assert.doesNotMatch(t, /retroactivo/)
})

test('efecto anterior a la firma añade el aviso retroactivo', () => {
  assert.match(textoAvisoAnulacionEnCola({ ...base, fechaEfecto: '2026-10-01' }), /⚠️ efecto retroactivo/)
})

test('efectoRetroactivo: mismo día no lo es; fecha rara tampoco', () => {
  assert.equal(efectoRetroactivo('2026-10-12', '2026-10-12'), false)
  assert.equal(efectoRetroactivo('2026-10-11', '2026-10-12'), true)
  assert.equal(efectoRetroactivo('basura', '2026-10-12'), false)
})

test('faltan compañía y póliza: no revienta', () => {
  assert.match(textoAvisoAnulacionEnCola({ ...base, compania: null, numeroPoliza: null }), /póliza sin datos/)
})
