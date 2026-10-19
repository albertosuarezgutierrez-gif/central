import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PREGUNTAS_CONCRETAS, esCodigoConcreto, preguntasConcretas } from './repregunta-concreta.ts'
import { contratoDatos } from './contrato-datos.ts'

test('🪤 cada pregunta concreta cuelga de una clave del contrato (auto, moto o comunidades)', () => {
  const claves = new Set(['auto', 'moto', 'comunidades'].flatMap((r) => contratoDatos(r).campos.map((c) => c.clave)))
  for (const [codigo, p] of Object.entries(PREGUNTAS_CONCRETAS)) assert.ok(claves.has(p.clave), `${codigo} → ${p.clave}`)
})

test('🪤 códigos desconocidos se ignoran y no se repite ninguno', () => {
  assert.equal(esCodigoConcreto('garaje'), true)
  assert.equal(esCodigoConcreto('toString'), false)
  const r = preguntasConcretas(['garaje', 'inventado', 'garaje', 'seguro_anterior_siniestros'])
  assert.deepEqual(r.map((x) => x.clave), ['garaje', 'aseguradoAntes'])
})

test('🪤 la referencia catastral se pide en comunidades (alimenta el Catastro)', () => {
  assert.ok(contratoDatos('comunidades').campos.some((c) => c.clave === 'referenciaCatastral' && c.pregunta))
})
