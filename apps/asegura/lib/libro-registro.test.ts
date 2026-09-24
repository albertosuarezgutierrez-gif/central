// Cepos del libro registro. Leen el FUENTE: lo que vigilan vive dentro de SQL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./libro-registro.ts', import.meta.url), 'utf8')

test('🪤 solo la cartera viva de esta correduría (el volcado de 2013-2018 no es intermediación)', () => {
  assert.match(src, /p\.correduria_id = \$\{correduriaId\}::uuid and p\.merged_into_poliza_id is null and \$\{viva\}/)
})

test('🪤 una prima 0 guardada no es una prima: nullif', () => {
  assert.match(src, /nullif\(coalesce\(p\.prima_bruta, p\.prima_anual\), 0\)/)
})

test('🪤 el DNI no cruza el puerto', () => {
  const sql = src.slice(src.indexOf('$queryRaw'), src.indexOf('order by'))
  assert.doesNotMatch(sql, /dni|nif|documento/i)
})
