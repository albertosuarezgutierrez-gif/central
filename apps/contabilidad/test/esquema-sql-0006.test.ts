// Guardián ESTÁTICO de 0006_gestoria.sql: RLS forzado por empresa en las tres tablas, FK compuestas (un objeto de otra empresa no se puede comentar ni revisar),
// autoría solo de vinculados activos, comentarios/revisiones solo-añadir, función del gestor limitada a su rol, permisos mínimos (nunca DELETE/TRUNCATE/ALL).
// Cepos vistos fallar el 07/11/2026: (1) quitar `FORCE ROW LEVEL SECURITY` → rojo en RLS; (2) `GRANT DELETE` → rojo en permisos; (3) cambiar `ue.rol = 'gestor'` por
// `ue.rol IS NOT NULL` en empresas_de_gestor → rojo en «solo gestor»; (4) quitar el trigger de autoría → rojo en autor_vinculado. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '0006_gestoria.sql'), 'utf8')
const CODIGO = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const TABLAS = ['revisiones', 'comentarios', 'terceros']
const tabla = (t: string) => { const d = CODIGO.slice(CODIGO.indexOf(`CREATE TABLE contabilidad.${t} (`)); return d.slice(0, d.indexOf('\n);')) }

test('es aditivo y transaccional: BEGIN … COMMIT, sin DROP/ALTER destructivo/DELETE/TRUNCATE ni IF NOT EXISTS engañoso', () => {
  assert.match(CODIGO, /^\s*BEGIN;/)
  assert.match(CODIGO, /COMMIT;\s*$/)
  assert.doesNotMatch(CODIGO, /\bDROP\b|\bDELETE\s+FROM\b|\bTRUNCATE\s+TABLE\b|ALTER TABLE[^;]*\bDROP\b/i)
  assert.doesNotMatch(CODIGO, /GRANT\s+ALL/i)
})

test('las tres tablas llevan empresa_id NOT NULL y RLS ENABLE + FORCE con política por empresa_actual()', () => {
  for (const t of TABLAS) assert.match(tabla(t), /empresa_id\s+uuid NOT NULL REFERENCES contabilidad\.empresas\(id\)/, t)
  assert.match(CODIGO, /FOREACH t IN ARRAY ARRAY\['revisiones', 'comentarios', 'terceros'\]/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.%I ENABLE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.%I FORCE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /USING \(empresa_id = contabilidad\.empresa_actual\(\)\) WITH CHECK \(empresa_id = contabilidad\.empresa_actual\(\)\)/)
})

test('FK compuestas (empresa_id, objeto_id): una revisión o un comentario no puede apuntar a un asiento o factura de OTRA empresa', () => {
  for (const t of ['revisiones', 'comentarios']) {
    assert.match(tabla(t), /FOREIGN KEY \(empresa_id, asiento_id\) REFERENCES contabilidad\.asientos \(empresa_id, id\)/, t)
    assert.match(tabla(t), /FOREIGN KEY \(empresa_id, factura_recibida_id\) REFERENCES contabilidad\.facturas_recibidas \(empresa_id, id\)/, t)
  }
  assert.match(tabla('revisiones'), /CHECK \(num_nonnulls\(asiento_id, factura_recibida_id\) = 1\)/)
  assert.match(tabla('comentarios'), /CHECK \(num_nonnulls\(asiento_id, factura_recibida_id, documento_ref\) = 1\)/)
  assert.match(CODIGO, /CREATE UNIQUE INDEX uq_revisiones_asiento ON contabilidad\.revisiones \(empresa_id, asiento_id\) WHERE asiento_id IS NOT NULL/)
  assert.match(CODIGO, /CREATE UNIQUE INDEX uq_revisiones_factura ON contabilidad\.revisiones \(empresa_id, factura_recibida_id\) WHERE factura_recibida_id IS NOT NULL/)
})

test('autoría: el trigger exige vínculo ACTIVO con la empresa y con el rol declarado, en comentarios y en revisiones', () => {
  const fn = CODIGO.slice(CODIGO.indexOf('FUNCTION contabilidad.autor_vinculado'), CODIGO.indexOf('CREATE TABLE contabilidad.revisiones'))
  assert.match(fn, /ue\.usuario_id = NEW\.usuario_id AND ue\.empresa_id = NEW\.empresa_id AND ue\.activo AND ue\.rol = NEW\.rol/)
  for (const t of ['revisiones', 'comentarios']) assert.match(CODIGO, new RegExp(`CREATE TRIGGER trg_${t}_autor BEFORE INSERT ON contabilidad\\.${t}\\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\\.autor_vinculado\\(\\)`), t)
  for (const t of ['revisiones', 'comentarios']) assert.match(tabla(t), /rol\s+text NOT NULL CHECK \(rol IN \('dueno', 'gestor'\)\)/, t)
})

test('comentarios y revisiones son solo-añadir: trigger de inmutabilidad en UPDATE/DELETE y TRUNCATE', () => {
  assert.match(CODIGO, /FOREACH t IN ARRAY ARRAY\['revisiones', 'comentarios'\]/)
  assert.match(CODIGO, /BEFORE UPDATE OR DELETE ON contabilidad\.%I\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.prohibir_cambios\(\)/)
  assert.match(CODIGO, /BEFORE TRUNCATE ON contabilidad\.%I\s+FOR EACH STATEMENT EXECUTE FUNCTION contabilidad\.prohibir_cambios\(\)/)
  assert.match(CODIGO, /CREATE TRIGGER trg_terceros_sin_truncate BEFORE TRUNCATE ON contabilidad\.terceros/)
})

test('asignación del gestor: empresas_de_gestor solo devuelve vínculos ACTIVOS de rol gestor (usuario y empresa activos), SECURITY DEFINER con search_path fijo y sin PUBLIC', () => {
  const fn = CODIGO.slice(CODIGO.indexOf('FUNCTION contabilidad.empresas_de_gestor'), CODIGO.indexOf('REVOKE ALL ON FUNCTION contabilidad.empresas_de_gestor'))
  assert.match(fn, /SECURITY DEFINER SET search_path = contabilidad, pg_temp/)
  assert.match(fn, /ue\.usuario_id = p_usuario AND ue\.rol = 'gestor' AND ue\.activo AND e\.activo AND u\.activo/)
  assert.match(CODIGO, /REVOKE ALL ON FUNCTION contabilidad\.empresas_de_gestor\(uuid\) FROM PUBLIC/)
  assert.match(CODIGO, /GRANT EXECUTE ON FUNCTION contabilidad\.empresas_de_gestor\(uuid\) TO prisma_contabilidad/)
  assert.match(CODIGO, /CREATE INDEX idx_usuario_empresas_gestor ON contabilidad\.usuario_empresas \(usuario_id\) WHERE activo AND rol = 'gestor'/)
})

test('terceros: NIF y tipo con CHECK, único por (empresa, NIF, tipo); texto y comentarios acotados', () => {
  assert.match(tabla('terceros'), /nif\s+text NOT NULL CHECK \(nif ~ '\^\[A-Z0-9\]\{8,12\}\$'\)/)
  assert.match(tabla('terceros'), /tipo\s+text NOT NULL CHECK \(tipo IN \('cliente', 'proveedor', 'acreedor'\)\)/)
  assert.match(tabla('terceros'), /UNIQUE \(empresa_id, nif, tipo\)/)
  assert.match(tabla('comentarios'), /texto\s+text NOT NULL CHECK \(btrim\(texto\) <> '' AND length\(texto\) <= 2000\)/)
})

test('permisos mínimos: SELECT/INSERT; UPDATE solo de datos de contacto de terceros; jamás DELETE/TRUNCATE/ALL', () => {
  assert.match(CODIGO, /GRANT SELECT, INSERT ON contabilidad\.revisiones TO prisma_contabilidad/)
  assert.match(CODIGO, /GRANT SELECT, INSERT ON contabilidad\.comentarios TO prisma_contabilidad/)
  assert.match(CODIGO, /GRANT SELECT, INSERT ON contabilidad\.terceros TO prisma_contabilidad/)
  const upd = [...CODIGO.matchAll(/GRANT UPDATE \(([^)]*)\) ON contabilidad\.(\w+)/g)]
  assert.deepEqual(upd.map((m) => m[2]), ['terceros'])
  assert.deepEqual(upd[0][1].split(',').map((x) => x.trim()).sort(), ['activo', 'actualizado_en', 'email', 'nombre', 'telefono'])
  assert.doesNotMatch(CODIGO, /GRANT[^;]*\b(DELETE|TRUNCATE)\b[^;]*TO/i)
  assert.match(CODIGO, /REVOKE DELETE, TRUNCATE ON contabilidad\.revisiones, contabilidad\.comentarios, contabilidad\.terceros FROM prisma_contabilidad/)
})
