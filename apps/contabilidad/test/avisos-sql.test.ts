// Guardián ESTÁTICO de 0002_avisos_plantillas.sql: avisos con RLS forzado por empresa, solo-lectura por trigger, clave única por
// empresa, permisos mínimos y función de cron SECURITY DEFINER con search_path fijo y sin PUBLIC.
// Cepos vistos fallar el 05/11/2026: (1) quitar `FORCE ROW LEVEL SECURITY` → rojo en RLS; (2) quitar el UNIQUE (empresa_id, clave) → rojo
// en deduplicación; (3) `GRANT DELETE` → rojo en permisos. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '0002_avisos_plantillas.sql'), 'utf8')
const CODIGO = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

test('avisos: empresa_id NOT NULL, RLS ENABLE + FORCE y política por empresa_actual()', () => {
  assert.match(CODIGO, /CREATE TABLE contabilidad\.avisos \(/)
  assert.match(CODIGO, /empresa_id\s+uuid NOT NULL REFERENCES contabilidad\.empresas\(id\)/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.avisos ENABLE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.avisos FORCE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /USING \(empresa_id = contabilidad\.empresa_actual\(\)\) WITH CHECK \(empresa_id = contabilidad\.empresa_actual\(\)\)/)
})

test('deduplicación: UNIQUE (empresa_id, clave) y alta con ON CONFLICT en el repositorio', () => {
  assert.match(CODIGO, /UNIQUE \(empresa_id, clave\)/)
  assert.match(readFileSync(join(import.meta.dirname, '..', 'lib', 'repo.ts'), 'utf8'), /ON CONFLICT \(empresa_id, clave\) DO NOTHING/)
})

test('permisos mínimos: SELECT/INSERT, UPDATE solo de leido_en/leido_por, nunca DELETE ni TRUNCATE; trigger de solo-lectura', () => {
  assert.match(CODIGO, /GRANT SELECT, INSERT ON contabilidad\.avisos TO prisma_contabilidad/)
  assert.match(CODIGO, /GRANT UPDATE \(leido_en, leido_por\) ON contabilidad\.avisos TO prisma_contabilidad/)
  assert.match(CODIGO, /REVOKE DELETE, TRUNCATE ON contabilidad\.avisos FROM prisma_contabilidad/)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*\b(DELETE|ALL)\b[^;]*ON contabilidad\.avisos/i)
  assert.match(CODIGO, /BEFORE UPDATE OR DELETE ON contabilidad\.avisos/)
  assert.match(CODIGO, /RAISE EXCEPTION 'contabilidad\.avisos no se borra'/)
})

test('empresas_activas(): SECURITY DEFINER, search_path fijo, REVOKE de PUBLIC y devuelve solo ids', () => {
  assert.match(CODIGO, /empresas_activas\(\) RETURNS TABLE \(o_id uuid\)/)
  assert.match(CODIGO, /SECURITY DEFINER SET search_path = contabilidad, pg_temp/)
  assert.match(CODIGO, /REVOKE ALL ON FUNCTION contabilidad\.empresas_activas\(\) FROM PUBLIC/)
  assert.match(CODIGO, /GRANT EXECUTE ON FUNCTION contabilidad\.empresas_activas\(\) TO prisma_contabilidad/)
})

test('sin contraseñas, sin float y sin tocar tablas de 0001', () => {
  assert.doesNotMatch(CODIGO, /PASSWORD/i)
  assert.doesNotMatch(CODIGO, /\b(numeric|real|double precision|float)\b/i)
  assert.doesNotMatch(CODIGO, /ALTER TABLE contabilidad\.(?!avisos\b)\w+/)
})
