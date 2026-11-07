// 0008: retira empresas_de_gestor (sin llamadas en el código) y hace única la revisión por (objeto, rol). Aditiva e idempotente; no toca 0006.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const SQL = readFileSync(join(raiz, 'prisma', 'sql', '0008_quitar_empresas_de_gestor.sql'), 'utf8')
const codigo = SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

test('0008: DROP FUNCTION IF EXISTS empresas_de_gestor e índices de revisión por rol, todo idempotente', () => {
  assert.match(codigo, /DROP FUNCTION IF EXISTS contabilidad\.empresas_de_gestor\(uuid\)/)
  assert.match(codigo, /CREATE UNIQUE INDEX IF NOT EXISTS uq_revisiones_asiento_rol\s+ON contabilidad\.revisiones \(empresa_id, asiento_id, rol\)/)
  assert.match(codigo, /CREATE UNIQUE INDEX IF NOT EXISTS uq_revisiones_factura_rol\s+ON contabilidad\.revisiones \(empresa_id, factura_recibida_id, rol\)/)
  assert.match(codigo, /DROP INDEX IF EXISTS contabilidad\.uq_revisiones_asiento;/)
  assert.doesNotMatch(codigo, /\b(DELETE|TRUNCATE)\b/)
})

test('nada del código de la app llama a empresas_de_gestor (por eso se puede borrar)', () => {
  const ficheros = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === '.next' || n === 'sql' || n.startsWith('esquema-sql')) return []
    const p = join(dir, n); return statSync(p).isDirectory() ? ficheros(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
  const usos = ['lib', 'app', 'test'].flatMap((d) => ficheros(join(raiz, d))).filter((f) => !f.endsWith('esquema-sql-0008.test.ts') && readFileSync(f, 'utf8').includes('empresas_de_gestor'))
  assert.deepEqual(usos, [])
})
