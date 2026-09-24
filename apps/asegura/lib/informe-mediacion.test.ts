// Cepos del informe anual de mediación. Leen el FUENTE: lo que vigilan vive dentro de SQL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./informe-mediacion.ts', import.meta.url), 'utf8')

test('🪤 las primas: cartera VIVA o recibo de CIMA (un recibo de CIMA en póliza del volcado también es intermediación)', () => {
  assert.match(src, /merged_into_poliza_id is null and \(\$\{viva\} or r\.eiac_xml_hash is not null\)/)
  assert.match(src, /Prisma\.raw\(sqlCarteraViva\('p'\)\)/)
})

test('🪤 las dos consultas de la cartera van acotadas a la correduría', () => {
  assert.equal(src.match(/p\.correduria_id = \$\{correduriaId\}::uuid/g)?.length, 2)
})

test('🪤 el año del recibo se decide en hora de Madrid (un efecto del 1 de enero no cae en el año anterior)', () => {
  assert.match(src, /at time zone 'Europe\/Madrid', 'YYYY-MM-DD'\) as efecto/)
})

test('🪤 el año sale del efecto del RECIBO: el inicial es el alta de la póliza y lo imputaría a otro año', () => {
  assert.doesNotMatch(src, /fecha_efecto_inicial/)
})
