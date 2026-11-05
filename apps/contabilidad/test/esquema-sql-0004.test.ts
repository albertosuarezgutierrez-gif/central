// Guardián ESTÁTICO de 0004_impuestos.sql: RLS forzado por empresa, ciclo de vida acotado (presentado definitivo, nada se borra), lo no
// soportado nunca sale de borrador, complementarias solo sobre versión presentada, justificante como texto y permisos mínimos.
// Cepos vistos fallar el 05/11/2026: (1) quitar `CHECK (estado = 'borrador' OR completo)` → rojo en «no soportado»; (2) `GRANT DELETE` →
// rojo en permisos; (3) quitar el IF OLD.estado = 'presentado' del trigger → rojo en «presentado definitivo». Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '0004_impuestos.sql'), 'utf8')
const CODIGO = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

test('declaraciones: empresa_id NOT NULL, RLS ENABLE + FORCE con política por empresa_actual()', () => {
  const def = CODIGO.slice(CODIGO.indexOf('CREATE TABLE contabilidad.declaraciones ('))
  assert.match(def.slice(0, def.indexOf('\n);')), /empresa_id\s+uuid NOT NULL REFERENCES contabilidad\.empresas\(id\)/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.declaraciones ENABLE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.declaraciones FORCE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /USING \(empresa_id = contabilidad\.empresa_actual\(\)\) WITH CHECK \(empresa_id = contabilidad\.empresa_actual\(\)\)/)
})

test('modelos, periodos y estados cerrados por CHECK; anuales ↔ 0A; una fila por (empresa, modelo, ejercicio, periodo, versión)', () => {
  assert.match(CODIGO, /modelo\s+text NOT NULL CHECK \(modelo IN \('303', '390', '111', '115', '190', '180', '347', '349', '130'\)\)/)
  assert.match(CODIGO, /periodo\s+text NOT NULL CHECK \(periodo IN \('1T', '2T', '3T', '4T', '0A'\)\)/)
  assert.match(CODIGO, /estado\s+text NOT NULL DEFAULT 'borrador' CHECK \(estado IN \('borrador', 'revisado', 'presentado'\)\)/)
  assert.match(CODIGO, /CHECK \(\(modelo IN \('390', '190', '180', '347'\)\) = \(periodo = '0A'\)\)/)
  assert.match(CODIGO, /UNIQUE \(empresa_id, modelo, anio, periodo, version\)/)
})

test('importes en céntimos enteros (bigint), sin float ni numeric', () => {
  assert.match(CODIGO, /resultado_cent\s+bigint/)
  assert.doesNotMatch(CODIGO, /\b(float|double precision|real|numeric|decimal|money)\b/i)
})

test('no soportado nunca sale de borrador: CHECK (estado = borrador OR completo)', () => {
  assert.match(CODIGO, /CHECK \(estado = 'borrador' OR completo\)/)
})

test('presentado exige fecha, justificante (texto 3-60) y marca de tiempo; revisado exige revisado_en', () => {
  assert.match(CODIGO, /CHECK \(\(estado = 'presentado'\) = \(presentado_el IS NOT NULL AND justificante IS NOT NULL AND presentado_en IS NOT NULL\)\)/)
  assert.match(CODIGO, /justificante IS NULL OR length\(btrim\(justificante\)\) BETWEEN 3 AND 60/)
  assert.match(CODIGO, /CHECK \(\(estado = 'borrador'\) = \(revisado_en IS NULL\)\)/)
  assert.doesNotMatch(CODIGO, /\b(bytea|fichero|archivo|contenido_pdf)\b/i, 'el justificante es una referencia de texto: nunca se guarda el fichero')
})

test('presentado definitivo, transiciones acotadas, cálculo inmutable fuera de borrador y nada se borra', () => {
  assert.match(CODIGO, /OLD\.estado = 'presentado' THEN\s+RAISE EXCEPTION/)
  assert.match(CODIGO, /\(OLD\.estado = 'borrador' AND NEW\.estado = 'revisado'\)\s+OR \(OLD\.estado = 'revisado' AND NEW\.estado IN \('borrador', 'presentado'\)\)/)
  assert.match(CODIGO, /OLD\.estado <> 'borrador' AND \(NEW\.calculo <> OLD\.calculo/)
  assert.match(CODIGO, /TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION/)
  assert.match(CODIGO, /BEFORE TRUNCATE ON contabilidad\.declaraciones/)
  assert.match(CODIGO, /BEFORE UPDATE OR DELETE ON contabilidad\.declaraciones\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.declaraciones_ciclo\(\)/)
})

test('complementaria: la versión > 1 exige la anterior presentada, y toda declaración nace en borrador', () => {
  assert.match(CODIGO, /NEW\.version > 1 AND NOT EXISTS/)
  assert.match(CODIGO, /d\.version = NEW\.version - 1 AND d\.estado = 'presentado'/)
  assert.match(CODIGO, /NEW\.estado <> 'borrador' THEN\s+RAISE EXCEPTION 'una declaración nace siempre en borrador'/)
  assert.match(CODIGO, /BEFORE INSERT ON contabilidad\.declaraciones/)
})

test('asientos de liquidación/pago: FK compuestas a asientos de la MISMA empresa', () => {
  assert.match(CODIGO, /FOREIGN KEY \(empresa_id, asiento_liquidacion_id\) REFERENCES contabilidad\.asientos \(empresa_id, id\)/)
  assert.match(CODIGO, /FOREIGN KEY \(empresa_id, asiento_pago_id\) REFERENCES contabilidad\.asientos \(empresa_id, id\)/)
})

test('permisos mínimos: SELECT/INSERT, UPDATE solo de columnas del ciclo (nunca identidad), jamás DELETE/TRUNCATE/ALL', () => {
  assert.match(CODIGO, /GRANT SELECT, INSERT ON contabilidad\.declaraciones TO prisma_contabilidad/)
  const upd = CODIGO.match(/GRANT UPDATE \(([^)]*)\)\s+ON contabilidad\.declaraciones/)![1].split(',').map((x) => x.trim())
  for (const prohibida of ['id', 'empresa_id', 'modelo', 'anio', 'periodo', 'version', 'creado_en']) assert.ok(!upd.includes(prohibida), `UPDATE no debe incluir ${prohibida}`)
  for (const necesaria of ['estado', 'calculo', 'presentado_el', 'justificante']) assert.ok(upd.includes(necesaria), `UPDATE debe incluir ${necesaria}`)
  assert.match(CODIGO, /REVOKE DELETE, TRUNCATE ON contabilidad\.declaraciones FROM prisma_contabilidad/)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*\b(DELETE|TRUNCATE|ALL)\b[^;]*ON contabilidad\./i)
})

test('va en una transacción y NO está aplicada (cabecera lo dice)', () => {
  assert.match(CODIGO, /^\s*BEGIN;/m)
  assert.match(CODIGO, /COMMIT;\s*$/m)
  assert.match(SQL, /NO APLICADA/)
})
