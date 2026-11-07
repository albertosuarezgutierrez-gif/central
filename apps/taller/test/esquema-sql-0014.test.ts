// Cepos de 0014 (roles múltiples y capacidades por rol), sin BD: se vigila el FUENTE.
// Visto fallar (07/11/2026) y restaurado: añadir 'ajustes' a taller.capacidades_delegables() → rojo «delegables ≡ módulo».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAPACIDADES, CAPACIDADES_RESERVADAS_DUENO, ROLES_EDITABLES, ROLES_TALLER } from '@central/module-taller'

const RAIZ = join(import.meta.dirname, '..')
const SQL = readFileSync(join(RAIZ, 'prisma', 'sql', '0014_roles_y_capacidades.sql'), 'utf8')
const CODIGO = SQL.replace(/^\s*--.*$/gm, '').replace(/--[^\n']*$/gm, '')
const PRISMA = readFileSync(join(RAIZ, 'prisma', 'schema.prisma'), 'utf8')
const lista = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((x) => x[1])

test('0014: una transacción, idempotente y ADITIVA (sin DROP de datos, sin DELETE, sin tocar RLS)', () => {
  assert.match(CODIGO, /^BEGIN;$/m)
  assert.match(CODIGO, /^COMMIT;$/m)
  assert.equal([...CODIGO.matchAll(/ADD COLUMN(?! IF NOT EXISTS)/g)].length, 0)
  assert.doesNotMatch(CODIGO, /\bDELETE\b|ROW LEVEL SECURITY|POLICY|DROP (TABLE|COLUMN|CONSTRAINT|FUNCTION)/)
  // El único DROP permitido: recrear el trigger (idempotencia).
  assert.deepEqual([...CODIGO.matchAll(/\bDROP\b[^;]*/g)].map((m) => m[0]), ['DROP TRIGGER IF EXISTS trg_usuarios_taller_sincronizar_rol ON taller.usuarios_taller'])
  assert.equal([...CODIGO.matchAll(/ADD CONSTRAINT (\w+)/g)].length, [...CODIGO.matchAll(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint/g)].length)
  // La columna `rol` se conserva: el backfill solo rellena `roles` vacíos.
  assert.match(CODIGO, /UPDATE taller\.usuarios_taller SET roles = ARRAY\[rol\] WHERE cardinality\(roles\) = 0;/)
  assert.equal([...CODIGO.matchAll(/\bUPDATE taller\./g)].length, 1)
})

test('0014: capacidades delegables ≡ módulo (todas menos las reservadas al dueño)', () => {
  const m = CODIGO.match(/FUNCTION taller\.capacidades_delegables\(\)[\s\S]*?SELECT ARRAY\[([^\]]*)\]/)
  assert.ok(m)
  assert.deepEqual(lista(m[1]), CAPACIDADES.filter((c) => !CAPACIDADES_RESERVADAS_DUENO.includes(c)))
})

test('0014: roles ≡ módulo; el JSON solo admite roles editables (nunca dueño)', () => {
  const r = CODIGO.match(/roles <@ ARRAY\[([^\]]*)\]/)
  assert.ok(r)
  assert.deepEqual(lista(r[1]).sort(), [...ROLES_TALLER].sort())
  const e = CODIGO.match(/e\.key NOT IN \(([^)]*)\)/)
  assert.ok(e)
  assert.deepEqual(lista(e[1]).sort(), [...ROLES_EDITABLES].sort())
  // Rol principal del trigger en el mismo orden que `rolPrincipal` (dueño > admin > recepción > mecánico).
  assert.deepEqual([...CODIGO.matchAll(/WHEN '(\w+)' = ANY \(NEW\.roles\)/g)].map((x) => x[1]), [...ROLES_TALLER])
})

test('0014: GRANT mínimos a prisma_taller', () => {
  assert.match(CODIGO, /GRANT SELECT \(roles, capacidades_extra\), UPDATE \(rol, roles, capacidades_extra, actualizado_en\) ON taller\.usuarios_taller TO prisma_taller;/)
  assert.match(CODIGO, /GRANT SELECT \(capacidades_por_rol\), UPDATE \(capacidades_por_rol, actualizado_en\) ON taller\.configuracion TO prisma_taller;/)
  assert.doesNotMatch(CODIGO, /GRANT ALL|GRANT .*DELETE/)
})

test('0014: schema.prisma conoce las columnas nuevas', () => {
  for (const c of ['capacidades_extra', 'capacidades_por_rol']) assert.match(PRISMA, new RegExp(`@map\\("${c}"\\)`))
  assert.match(PRISMA, /roles\s+String\[\]\s+@default\(\[\]\)/)
})
