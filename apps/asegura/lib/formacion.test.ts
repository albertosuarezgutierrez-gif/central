// Cepos de la formación continua IDD. Leen el FUENTE: lo que vigilan vive dentro de SQL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./formacion.ts', import.meta.url), 'utf8')

test('🪤 lectura, alta, borrado y bajas van acotados a la correduría', () => {
  assert.equal(src.match(/correduria_id = \$\{correduriaId\}::uuid/g)?.length, 5)
  assert.match(src, /values \(\$\{correduriaId\}::uuid,/)
})

test('🪤 se leen años anteriores: quien se formó antes y este año no, sale con 0 horas', () => {
  assert.match(src, /make_date\(\$\{año - AÑOS_ATRAS\}::int, 1, 1\)/)
})

test('🪤 las bajas llegan al resumen y se guardan por la MISMA clave que las agrupa', () => {
  assert.match(src, /resumenFormacion\(registros, año, hoyMadrid\(\), HORAS_MINIMAS_IDD, bajas\)/)
  assert.match(src, /values \(\$\{correduriaId\}::uuid, \$\{clavePersona\(v\.valor\.persona\)\}/)
  assert.match(src, /persona_clave = \$\{clave\}/)
})
