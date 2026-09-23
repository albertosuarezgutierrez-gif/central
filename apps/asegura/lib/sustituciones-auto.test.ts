// Cepo del enlace automático de sustituciones: lee el FUENTE (SQL crudo).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./sustituciones-auto.ts', import.meta.url), 'utf8')

test('solo escribe NUESTROS campos, y sin pisar un enlace que ya exista', () => {
  assert.match(src, /set poliza_origen_id = \$\{e\.viejaId\}::uuid, updated_at = now\(\)\s+where id = \$\{e\.nuevaId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and poliza_origen_id is null/)
  assert.match(src, /set sustituida_at = now\(\), updated_at = now\(\)\s+where id = \$\{e\.viejaId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and sustituida_at is null/)
  assert.doesNotMatch(src, /set[^`]*\bestado\s*=/, 'el estado de la póliza es de CIMA')
})

test('la lectura va acotada a la correduría, a la cartera viva y sin fusionadas', () => {
  assert.match(src, /where p\.correduria_id = \$\{correduriaId\}::uuid and \$\{viva\} and p\.merged_into_poliza_id is null/)
})
