// Cepos del esquema SQL (sin BD): taller_id en toda tabla, RLS, rol sin BYPASSRLS y espejos TS ↔ SQL.
// Movido de packages/module-taller (04/11/2026): el SQL vive en apps/taller/prisma/sql (convención de almacen).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ESTADOS_OT, FINALIDADES_CONSENTIMIENTO, CANALES_CONSENTIMIENTO, TIPOS_AVISO_SERVICIO, TIPOS_AVISO_COMERCIAL,
  normalizarMatricula, configDeAlta,
} from '@central/module-taller'

const DIR = join(import.meta.dirname, '..', 'prisma', 'sql')
const SCHEMA = readFileSync(join(DIR, '0001_schema_taller.sql'), 'utf8')
const ALTAS = readFileSync(join(DIR, '0002_altas_iniciales.sql'), 'utf8')
const SQL = `${SCHEMA}\n${ALTAS}`
const tablas = [...SCHEMA.matchAll(/CREATE TABLE taller\.(\w+) \(([\s\S]*?)\n\);/g)].map((m) => ({ nombre: m[1], cuerpo: m[2] }))
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

test('0002: rol sin contraseña y sin BYPASSRLS; 0001 no crea el rol', () => {
  assert.doesNotMatch(SCHEMA, /CREATE ROLE/)
  assert.match(ALTAS, /ALTER ROLE prisma_taller WITH NOBYPASSRLS;/)
  assert.doesNotMatch(ALTAS, /^\s*ALTER ROLE prisma_taller WITH PASSWORD/m)
  assert.match(ALTAS, /REVOKE INSERT, UPDATE, DELETE ON taller\.talleres FROM prisma_taller;/)
})

test('bloqueos_pin existe con clave (taller_id, clave)', () => {
  assert.match(SCHEMA, /CREATE TABLE taller\.bloqueos_pin \([\s\S]*PRIMARY KEY \(taller_id, clave\)/)
})

// Espejo 0002 ≡ configDeAlta(): si cambian los valores de alta del módulo, el SQL del piloto debe cambiar con ellos.
const valores = (tabla: string) => {
  const m = ALTAS.match(new RegExp(`INSERT INTO taller\\.${tabla} \\([^)]*\\)\\s*VALUES([\\s\\S]*?)ON CONFLICT`))
  assert.ok(m, `no encuentro el INSERT de ${tabla}`)
  return [...m[1].matchAll(/\(([^()]*)\)/g)].map((x) =>
    [...x[1].matchAll(/'((?:[^']|'')*)'|(true|false|\d+)/g)].map((y) => (y[1] !== undefined ? y[1] : y[2] === 'true' ? true : y[2] === 'false' ? false : Number(y[2]))).slice(1))
}

test('espejo: 0002 siembra exactamente configDeAlta()', () => {
  const a = configDeAlta()
  assert.deepEqual(valores('tipos_iva'), a.ivas.map((i) => [i.codigo, i.nombre, i.puntosBasicos]))
  assert.deepEqual(valores('iva_por_defecto'), Object.entries(a.ivaPorDefecto))
  assert.deepEqual(valores('tipos_vehiculo'), a.tiposVehiculo.map((t) => [t.codigo, t.nombre, t.recargoPuntosBasicos]))
  assert.deepEqual(valores('series_factura'), a.series.map((s) => [s.codigo, s.prefijo, s.descripcion, s.rectificativa, s.porDefecto]))
  assert.deepEqual(valores('medios_cobro'), a.mediosCobro.map((m) => [m.codigo, m.nombre, m.esEfectivo]))
  const i = a.intervalosAvisos
  assert.deepEqual(valores('configuracion')[0], [
    a.precioHoraCent, a.validezPresupuestoDias, i.itvAntelacionDias, i.revisionFechaAntelacionDias, i.revisionKmAntelacion,
    i.seguroAntelacionDias, i.recordatorioCitaHoras, a.horarioCitas.duracionHuecoMinutos, a.horarioCitas.puestos,
    a.textos.pieResguardo, a.textos.pieFactura, a.textos.condicionesPresupuesto, a.textos.firmaCorreo,
    a.textos.textoConsentimientoComercialTaller, a.textos.versionTextoComercialTaller,
  ])
  assert.deepEqual(a.paquetes, [], 'si el alta trae paquetes, 0002 debe sembrarlos')
  assert.deepEqual(a.aceites, [])
  assert.deepEqual(a.horarioCitas.franjas, [])
})

test('0002: el taller piloto y Calle Socorro no se confunden (dirección del piloto, Camas)', () => {
  assert.match(ALTAS, /'41900', 'Sevilla', 'Camas', 'Calle Cañada Real', '14'/)
})
