// Cepos del esquema SQL (sin BD): taller_id en toda tabla, RLS, rol sin BYPASSRLS y espejos TS ↔ SQL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ESTADOS_OT, FINALIDADES_CONSENTIMIENTO, CANALES_CONSENTIMIENTO, TIPOS_AVISO_SERVICIO, TIPOS_AVISO_COMERCIAL,
  normalizarMatricula,
} from '../src/index.ts'

const SQL = readFileSync(join(import.meta.dirname, '..', 'sql', '0001_schema_taller.sql'), 'utf8')
const tablas = [...SQL.matchAll(/CREATE TABLE taller\.(\w+) \(([\s\S]*?)\n\);/g)].map((m) => ({ nombre: m[1], cuerpo: m[2] }))
const listaCheck = (columna: string): string[] => {
  const m = SQL.match(new RegExp(`${columna}\\s+text NOT NULL[^\\n]*CHECK \\(${columna} IN \\(([\\s\\S]*?)\\)\\)`))
  assert.ok(m, `no encuentro el CHECK de ${columna}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('hay tablas que vigilar', () => assert.ok(tablas.length >= 30, `solo ${tablas.length}`))

test('toda tabla de negocio lleva taller_id NOT NULL (talleres usa su id)', () => {
  const sin = tablas.filter((t) => t.nombre !== 'talleres' && !/^\s*taller_id\s+uuid\s+(NOT NULL|PRIMARY KEY)/m.test(t.cuerpo))
  assert.deepEqual(sin.map((t) => t.nombre), [])
})

test('RLS activado y forzado sobre TODAS las tablas del schema, con política por taller', () => {
  assert.match(SQL, /FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'taller' LOOP/)
  assert.match(SQL, /ENABLE ROW LEVEL SECURITY/)
  assert.match(SQL, /FORCE ROW LEVEL SECURITY/)
  assert.match(SQL, /= taller\.taller_actual\(\)\) WITH CHECK/)
  assert.match(SQL, /current_setting\('taller\.taller_id', true\)/)
})

test('rol prisma_taller sin BYPASSRLS ni contraseña', () => {
  assert.match(SQL, /CREATE ROLE prisma_taller WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;/)
  assert.doesNotMatch(SQL, /(?<!NO)BYPASSRLS/)
  assert.doesNotMatch(SQL, /prisma_taller[^;]*PASSWORD '/)
})

test('consentimientos y leads: solo-añadir', () => {
  assert.match(SQL, /REVOKE UPDATE, DELETE ON taller\.consentimientos, taller\.leads_enviados, taller\.auditoria FROM prisma_taller;/)
  assert.match(SQL, /GRANT UPDATE \(retirado_en, motivo_retirada, actualizado_en\) ON taller\.consentimientos TO prisma_taller;/)
  assert.match(SQL, /BEFORE UPDATE OR DELETE ON taller\.consentimientos/)
  assert.match(SQL, /BEFORE INSERT ON taller\.leads_enviados/)
})

test('matrícula única por taller sobre la normalizada', () => {
  assert.match(SQL, /CONSTRAINT ux_vehiculos_matricula UNIQUE \(taller_id, matricula_normalizada\)/)
})

test('espejo: normalización de matrícula SQL ≡ normalizarMatricula()', () => {
  const m = SQL.match(/matricula_normalizada text GENERATED ALWAYS AS \(upper\(regexp_replace\(matricula, '([^']+)', '', 'g'\)\)\)/)
  assert.ok(m, 'no encuentro la columna generada')
  const comoSql = (s: string) => s.replace(new RegExp(m[1], 'g'), '').toUpperCase()
  for (const s of ['1234-bcd', ' 1234 BCD ', 'se-1234-ab', 'M·1234·XY', '0000ZZZ']) {
    assert.equal(normalizarMatricula(s), comoSql(s), s)
  }
})

test('espejo: estados de OT', () => {
  const m = SQL.match(/estado\s+text NOT NULL DEFAULT 'recepcion' CHECK \(estado IN \(([\s\S]*?)\)\)/)
  assert.ok(m, 'no encuentro el CHECK de ordenes_trabajo.estado')
  assert.deepEqual([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]), [...ESTADOS_OT])
})
test('espejo: finalidades de consentimiento', () => assert.deepEqual(listaCheck('finalidad'), [...FINALIDADES_CONSENTIMIENTO]))
test('espejo: canales de consentimiento', () => assert.deepEqual(listaCheck('canal'), [...CANALES_CONSENTIMIENTO]))
test('espejo: tipos de aviso', () => {
  const m = SQL.match(/tipo\s+text NOT NULL CHECK \(tipo IN \(('terminado'[^)]*)\)\)/)
  assert.ok(m)
  assert.deepEqual([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]), [...TIPOS_AVISO_SERVICIO, ...TIPOS_AVISO_COMERCIAL])
})
