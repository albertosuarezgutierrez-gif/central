import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeFugas, type Fuga } from './fugas-cartera.ts'

const f = (o: Partial<Fuga> = {}): Fuga => ({
  id: 'e1', tipo: 'POLIZA_BAJA', titulo: 'Póliza dada de baja', clienteId: 'c1',
  cliente: 'Ana <Pérez>', polizaNumero: '123', aseguradora: 'MAPFRE', estado: 'cancelada', ...o,
})

test('el aviso lleva tipo, cliente enlazado, compañía y número, con HTML escapado', () => {
  const m = mensajeFugas([f()], (id) => `https://p/correduria/cliente/${id}`)
  assert.match(m, /Póliza dada de baja/)
  assert.match(m, /<a href="https:\/\/p\/correduria\/cliente\/c1">Ana &lt;Pérez&gt;<\/a>/)
  assert.match(m, /MAPFRE nº 123/)
  assert.doesNotMatch(m, /<Pérez>/)
})

test('sin enlace no inventa uno y con muchas recorta', () => {
  assert.doesNotMatch(mensajeFugas([f()], () => null), /<a /)
  const m = mensajeFugas(Array.from({ length: 20 }, (_, i) => f({ id: `e${i}` })), () => null)
  assert.match(m, /…y 5 más/)
})
