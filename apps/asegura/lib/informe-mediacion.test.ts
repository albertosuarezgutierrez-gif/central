// Cepos del informe anual de mediación. Leen el FUENTE: lo que vigilan vive dentro de SQL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./informe-mediacion.ts', import.meta.url), 'utf8')

test('🪤 las primas salen solo de la cartera VIVA: el volcado histórico no es intermediación del año', () => {
  assert.match(src, /merged_into_poliza_id is null and \$\{viva\}/)
  assert.match(src, /Prisma\.raw\(sqlCarteraViva\('p'\)\)/)
})

test('🪤 las dos consultas de la cartera van acotadas a la correduría', () => {
  assert.equal(src.match(/p\.correduria_id = \$\{correduriaId\}::uuid/g)?.length, 2)
})

test('🪤 el año del recibo se decide en hora de Madrid (un efecto del 1 de enero no cae en el año anterior)', () => {
  assert.match(src, /at time zone 'Europe\/Madrid', 'YYYY-MM-DD'\) as efecto/)
})
