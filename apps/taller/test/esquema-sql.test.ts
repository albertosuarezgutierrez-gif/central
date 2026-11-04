// Cepos del esquema SQL (sin BD): taller_id en toda tabla, RLS, rol sin BYPASSRLS y espejos TS ↔ SQL.
// Movido de packages/module-taller (04/11/2026): el SQL vive en apps/taller/prisma/sql (convención de almacen).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ESTADOS_OT, FINALIDADES_CONSENTIMIENTO, CANALES_CONSENTIMIENTO, TIPOS_AVISO_SERVICIO, TIPOS_AVISO_COMERCIAL,
  normalizarMatricula, configDeAlta, ESTADOS_CITA,
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
test('espejo: canales de consentimiento (0001 + ampliación de 0007)', () => {
  // 0001 trae los tres primeros; 0007 sustituye la restricción añadiendo «cita_enlace». La lista vigente es la de 0007.
  const s7 = readFileSync(join(DIR, '0007_citas_enlace.sql'), 'utf8')
  const m = s7.match(/ADD CONSTRAINT consentimientos_canal_check CHECK \(canal IN \(([^)]*)\)\)/)
  assert.ok(m, 'no encuentro la restricción de canal en 0007')
  const lista = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.deepEqual(lista, [...CANALES_CONSENTIMIENTO])
  assert.deepEqual(listaCheck('canal'), lista.slice(0, 3), '0001 sigue siendo la base')
})
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

test('espejo: 0003 (tope de login por taller) ≡ seguridadLogin de configDeAlta()', () => {
  const sql = readFileSync(join(DIR, '0003_seguridad_login.sql'), 'utf8')
  const d = (col: string) => Number(sql.match(new RegExp(`${col}\\s+integer NOT NULL DEFAULT (\\d+)`))?.[1])
  const a = configDeAlta().seguridadLogin
  assert.equal(d('login_max_fallos_taller'), a.maxFallosTaller)
  assert.equal(d('login_ventana_minutos'), a.ventanaMinutos)
  assert.equal(d('login_bloqueo_taller_minutos'), a.bloqueoMinutos)
})

// ── 0004: marca, sesión, PIN temporal, notas/fotos/propuestas, alta de talleres ──────────────────────────────────
const S4 = readFileSync(join(DIR, '0004_marca_pin_ot_alta.sql'), 'utf8')
const tablas4 = [...S4.matchAll(/CREATE TABLE IF NOT EXISTS taller\.(\w+) \(([\s\S]*?)\n\);/g)].map((m) => ({ nombre: m[1], cuerpo: m[2] }))

test('0004: tablas nuevas con taller_id NOT NULL, RLS forzado y política por taller, y concedidas al rol', () => {
  assert.deepEqual(tablas4.map((t) => t.nombre).sort(), ['ot_fotos', 'ot_notas', 'ot_propuesta_lineas', 'ot_propuestas'])
  for (const t of tablas4) {
    assert.match(t.cuerpo, /taller_id\s+uuid NOT NULL/, t.nombre)
    assert.match(S4, new RegExp(`'${t.nombre}'`), `${t.nombre} entra en el bucle de RLS`)
    assert.match(S4, new RegExp(`GRANT [^;]*taller\\.${t.nombre}[^;]* TO prisma_taller;`), `GRANT ${t.nombre}`)
  }
  assert.match(S4, /FORCE ROW LEVEL SECURITY/)
  assert.match(S4, /USING \(taller_id = taller\.taller_actual\(\)\) WITH CHECK/)
  // FK compuestas (taller_id, x): una fila nunca apunta a otra de otro taller.
  assert.ok(!/REFERENCES taller\.\w+\(id\)/.test(S4.replace(/REFERENCES taller\.talleres/g, '')))
})

test('0004: ninguna columna de marca en `talleres` (el rol no puede escribirla): van en `configuracion`', () => {
  assert.match(S4, /ALTER TABLE taller\.configuracion[\s\S]*marca_logo_ruta[\s\S]*marca_color_primario[\s\S]*marca_color_secundario/)
  assert.doesNotMatch(S4, /ALTER TABLE taller\.talleres/)
  assert.match(S4, /\^#\[0-9a-f\]\{6\}\$/)
})

test('espejo: 0004 (sesión e inactividad) ≡ seguridadLogin de configDeAlta()', () => {
  const d = (col: string) => Number(S4.match(new RegExp(`${col}\\s+integer NOT NULL DEFAULT (\\d+)`))?.[1])
  const a = configDeAlta().seguridadLogin
  assert.equal(d('login_sesion_minutos'), a.sesionMinutos)
  assert.equal(d('login_inactividad_minutos'), a.inactividadMinutos)
})

test('0004: alta_taller es SECURITY DEFINER, con search_path fijo, solo EXECUTE para el rol, y NIF único', () => {
  assert.match(S4, /FUNCTION taller\.alta_taller\([^)]*\)[\s\S]*SECURITY DEFINER SET search_path = taller, pg_temp/)
  assert.match(S4, /REVOKE ALL ON FUNCTION taller\.alta_taller\(text, text, text\) FROM PUBLIC;/)
  assert.match(S4, /GRANT EXECUTE ON FUNCTION taller\.alta_taller\(text, text, text\) TO prisma_taller;/)
  assert.match(S4, /CREATE UNIQUE INDEX IF NOT EXISTS ux_talleres_nif ON taller\.talleres \(nif\) WHERE nif IS NOT NULL;/)
  assert.doesNotMatch(S4, /GRANT INSERT[^;]*taller\.talleres/)
})

test('0004: PIN temporal y propuestas sin precio', () => {
  assert.match(S4, /ADD COLUMN IF NOT EXISTS debe_cambiar_pin boolean NOT NULL DEFAULT false/)
  const prop = tablas4.find((t) => t.nombre === 'ot_propuesta_lineas')!
  assert.doesNotMatch(prop.cuerpo, /precio|_cent/, 'el mecánico no ve ni escribe precios')
})

// ── 0007: citas por enlace y agenda con capacidad ─────────────────────────────────────────────────────────────
const S7 = readFileSync(join(DIR, '0007_citas_enlace.sql'), 'utf8')

test('0007: tablas nuevas con taller_id NOT NULL, RLS forzado, política por taller y concedidas al rol', () => {
  const tablas7 = [...S7.matchAll(/CREATE TABLE IF NOT EXISTS taller\.(\w+) \(([\s\S]*?)\n\);/g)].map((m) => ({ nombre: m[1], cuerpo: m[2] }))
  assert.deepEqual(tablas7.map((t) => t.nombre).sort(), ['cierres_agenda', 'invitaciones_cita'])
  for (const t of tablas7) {
    assert.match(t.cuerpo, /taller_id\s+uuid NOT NULL/, t.nombre)
    assert.match(S7, new RegExp(`'${t.nombre}'`), `${t.nombre} entra en el bucle de RLS`)
  }
  assert.match(S7, /FORCE ROW LEVEL SECURITY/)
  assert.match(S7, /USING \(taller_id = taller\.taller_actual\(\)\) WITH CHECK/)
  assert.match(S7, /GRANT SELECT, INSERT, UPDATE, DELETE ON taller\.cierres_agenda, taller\.invitaciones_cita TO prisma_taller;/)
  assert.ok(!/REFERENCES taller\.\w+\(id\)/.test(S7.replace(/REFERENCES taller\.talleres/g, '')), 'FK compuestas (taller_id, x)')
})

test('espejo: 0007 (agenda) ≡ AGENDA_ALTA de configDeAlta()', () => {
  const d = (col: string) => S7.match(new RegExp(`${col}\\s+(?:integer|text) NOT NULL DEFAULT '?([\\w/]+)'?`))?.[1]
  const a = configDeAlta().agenda
  assert.equal(d('agenda_zona_horaria'), a.zonaHoraria)
  assert.equal(Number(d('agenda_max_coches_franja')), a.maxCochesPorFranja)
  assert.equal(Number(d('agenda_ocupable_pb')), a.ocupablePuntosBasicos)
  assert.equal(Number(d('agenda_margen_minutos')), a.margenEntreTrabajosMinutos)
  assert.equal(Number(d('agenda_antelacion_min_horas')), a.antelacionMinimaHoras)
  assert.equal(Number(d('agenda_antelacion_max_dias')), a.antelacionMaximaDias)
  assert.equal(d('agenda_confirmacion'), a.confirmacion)
  assert.equal(Number(d('agenda_diagnostico_minutos')), a.duracionDiagnosticoMinutos)
  assert.equal(Number(d('agenda_invitacion_caduca_dias')), a.invitacionCaducaDias)
})

test('espejo: estados de cita ≡ ESTADOS_CITA', () => {
  const m = SCHEMA.match(/estado\s+text NOT NULL DEFAULT 'pedida' CHECK \(estado IN \(([^)]*)\)\)/)
  assert.ok(m)
  assert.deepEqual([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]), [...ESTADOS_CITA])
})

// ── 0008: firma de retirada y retención de fotos ─────────────────────────────────────────────────────────────────
import { RETIRADA_ALTA, FOTOS_RETENCION_DIAS_ALTA, FOTOS_RETENCION_MIN_DIAS } from '@central/module-taller'
const S8 = readFileSync(join(DIR, '0008_retirada_y_retencion_fotos.sql'), 'utf8')

test('0008: espejo de los valores de alta (plazo 180, mínimo 90, firma obligatoria, texto y versión)', () => {
  assert.equal(Number(S8.match(/fotos_retencion_dias integer NOT NULL DEFAULT (\d+)/)?.[1]), FOTOS_RETENCION_DIAS_ALTA)
  assert.equal(Number(S8.match(/CHECK \(fotos_retencion_dias >= (\d+)\)/)?.[1]), FOTOS_RETENCION_MIN_DIAS)
  assert.match(S8, new RegExp(`retirada_firma_obligatoria boolean NOT NULL DEFAULT ${RETIRADA_ALTA.firmaObligatoria}`))
  assert.equal(S8.match(/retirada_texto_conformidad text NOT NULL DEFAULT '([^']*)'/)?.[1], RETIRADA_ALTA.textoConformidad)
  assert.equal(S8.match(/retirada_version_texto text NOT NULL DEFAULT '([^']*)'/)?.[1], RETIRADA_ALTA.versionTextoConformidad)
})

test('0008: idempotente, sin tablas nuevas (nada sin RLS), purgada_en en las dos tablas de fotos y NO en firmas/presupuestos/facturas', () => {
  assert.doesNotMatch(S8, /CREATE TABLE/)
  assert.match(S8, /ALTER TABLE taller\.recepcion_fotos ADD COLUMN IF NOT EXISTS purgada_en timestamptz;/)
  assert.match(S8, /ALTER TABLE taller\.ot_fotos ADD COLUMN IF NOT EXISTS purgada_en timestamptz;/)
  assert.equal([...S8.matchAll(/purgada_en timestamptz/g)].length, 2, 'solo las dos tablas de fotos')
  // Cada ALTER/CREATE es reejecutable: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE, constraint tras comprobar pg_constraint.
  const codigo = S8.replace(/^--.*$/gm, '')
  assert.equal([...codigo.matchAll(/ADD COLUMN(?! IF NOT EXISTS)/g)].length, 0)
  assert.equal([...codigo.matchAll(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g)].length, 0)
  assert.match(codigo, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'ck_ot_entrega_firma'\)/)
  assert.match(S8, /^BEGIN;$/m)
  assert.match(S8, /^COMMIT;$/m)
})

test('0008: la entrega guarda firma + texto + versión + nombre juntos (CHECK) y los campos existen en OT', () => {
  for (const c of ['entrega_firma_ruta', 'entrega_conformidad_texto', 'entrega_conformidad_version', 'entrega_retira_nombre']) {
    assert.match(S8, new RegExp(`ADD COLUMN IF NOT EXISTS ${c} text`))
  }
  assert.match(S8, /ck_ot_entrega_firma/)
  assert.match(S8, /entregado_en IS NOT NULL/)
})

test('0008: talleres_activos() es SECURITY DEFINER, devuelve solo ids, sin PUBLIC y con EXECUTE para el rol de la app', () => {
  assert.match(S8, /FUNCTION taller\.talleres_activos\(\)\s+RETURNS SETOF uuid[\s\S]*SECURITY DEFINER SET search_path = taller, pg_temp/)
  assert.match(S8, /REVOKE ALL ON FUNCTION taller\.talleres_activos\(\) FROM PUBLIC;/)
  assert.match(S8, /GRANT EXECUTE ON FUNCTION taller\.talleres_activos\(\) TO prisma_taller;/)
})

test('0008: bloqueos_codigo sigue sin taller_id a propósito y esta migración no la toca', () => {
  assert.doesNotMatch(S8.replace(/^--.*$/gm, ''), /bloqueos_codigo/)
})
