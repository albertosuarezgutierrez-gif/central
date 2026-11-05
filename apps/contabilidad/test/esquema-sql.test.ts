// Guardián ESTÁTICO de 0001_schema_contabilidad.sql (no se aplica aquí: se lee el fichero).
// Lo que no puede faltar nunca: rol NOBYPASSRLS, RLS ENABLE+FORCE en todas las tablas, inmutabilidad de asientos/apuntes,
// cuadre diferido en BD, idempotencia de hechos, funciones SECURITY DEFINER con search_path fijo y sin PUBLIC, y permisos mínimos.
// Cepos vistos fallar el 05/11/2026: (1) quitar 'apuntes' del ARRAY de inmutables → rojo en «inmutables»; (2) quitar
// `SET search_path` de `sesion_vigente` → rojo en «SECURITY DEFINER»; (3) cambiar el UNIQUE de hechos a (empresa_id, ref) → rojo
// en «idempotencia». Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '0001_schema_contabilidad.sql'), 'utf8')
// Sin comentarios de línea (la cabecera explica cosas que no deben contar como código).
const CODIGO = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

const tablas = [...CODIGO.matchAll(/CREATE TABLE contabilidad\.(\w+)/g)].map((m) => m[1])

test('el rol de la app nace y se fuerza NOBYPASSRLS, sin contraseña en el fichero', () => {
  assert.match(CODIGO, /CREATE ROLE prisma_contabilidad WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS/)
  assert.match(CODIGO, /ALTER ROLE prisma_contabilidad WITH NOBYPASSRLS/)
  assert.doesNotMatch(CODIGO, /PASSWORD/i)
})

test('tablas mínimas de §5 presentes', () => {
  for (const t of ['empresas', 'usuarios', 'usuario_empresas', 'ejercicios', 'plan_cuentas', 'asientos', 'apuntes', 'hechos_contables',
    'reglas_asiento', 'auditoria', 'consentimiento_seguros', 'origenes_autorizados', 'acceso_otps']) {
    assert.ok(tablas.includes(t), `falta la tabla ${t}`)
  }
})

test('RLS ENABLE + FORCE para TODAS las tablas por bucle (sin excluir ninguna) y política por empresa_actual()', () => {
  assert.match(CODIGO, /FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'contabilidad' LOOP/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.%I ENABLE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.%I FORCE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /USING \(empresa_id = contabilidad\.empresa_actual\(\)\) WITH CHECK \(empresa_id = contabilidad\.empresa_actual\(\)\)/)
  assert.match(CODIGO, /current_setting\('contabilidad\.empresa_id', true\)/)
  // Las tablas creadas DESPUÉS del bucle no tendrían RLS: el bucle debe ir tras el último CREATE TABLE.
  assert.ok(CODIGO.lastIndexOf('CREATE TABLE') < CODIGO.indexOf("FOR t IN SELECT tablename FROM pg_tables"), 'hay un CREATE TABLE después del bucle de RLS')
  // Toda tabla con empresa_id usa la política por empresa (excepciones explícitas y con motivo).
  for (const t of tablas) {
    const def = CODIGO.slice(CODIGO.indexOf(`CREATE TABLE contabilidad.${t} (`))
    const tieneEmpresa = /^\s*empresa_id\s+uuid NOT NULL/m.test(def.slice(0, def.indexOf(');')))
    if (!['empresas', 'usuarios', 'acceso_otps'].includes(t)) assert.ok(tieneEmpresa, `${t} sin empresa_id NOT NULL`)
  }
})

test('inmutables: asientos, apuntes, auditoria y reglas con trigger que impide UPDATE/DELETE/TRUNCATE y sin esos permisos', () => {
  const m = /FOREACH t IN ARRAY ARRAY\[([^\]]+)\] LOOP\s+EXECUTE format\('CREATE TRIGGER trg_%s_inmutable BEFORE UPDATE OR DELETE/.exec(CODIGO)
  assert.ok(m, 'no está el bucle de triggers de inmutabilidad')
  for (const t of ['asientos', 'apuntes', 'auditoria', 'reglas_asiento']) assert.match(m![1], new RegExp(`'${t}'`), `${t} no es inmutable`)
  assert.match(CODIGO, /RAISE EXCEPTION 'contabilidad\.% es inmutable/)
  assert.match(CODIGO, /GRANT SELECT, INSERT ON contabilidad\.asientos, contabilidad\.apuntes, contabilidad\.auditoria, contabilidad\.reglas_asiento\s+TO prisma_contabilidad/)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*\b(UPDATE|DELETE|ALL)\b[^;]*ON contabilidad\.(asientos|apuntes)\b/)
  assert.match(CODIGO, /REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA contabilidad FROM prisma_contabilidad/)
  assert.doesNotMatch(CODIGO, /GRANT ALL/i)
})

test('cuadre en BD: trigger DIFERIDO (al COMMIT) en asientos y apuntes que exige ≥2 apuntes y Σ debe = Σ haber', () => {
  assert.match(CODIGO, /CREATE CONSTRAINT TRIGGER trg_asientos_cuadre\s+AFTER INSERT ON contabilidad\.asientos\s+DEFERRABLE INITIALLY DEFERRED/)
  assert.match(CODIGO, /CREATE CONSTRAINT TRIGGER trg_apuntes_cuadre\s+AFTER INSERT ON contabilidad\.apuntes\s+DEFERRABLE INITIALLY DEFERRED/)
  assert.match(CODIGO, /IF n < 2 THEN/)
  assert.match(CODIGO, /IF d <> h THEN/)
  assert.match(CODIGO, /CHECK \(\(debe > 0\) <> \(haber > 0\)\)/)
  assert.match(CODIGO, /debe\s+bigint NOT NULL/)
  assert.doesNotMatch(CODIGO, /\b(numeric|real|double precision|float)\b/i, 'importes en céntimos bigint, nunca decimales')
})

test('asiento solo en ejercicio ABIERTO y apunte solo a cuenta hoja/activa (triggers BEFORE INSERT); contador solo crece', () => {
  assert.match(CODIGO, /BEFORE INSERT ON contabilidad\.asientos\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.asiento_en_ejercicio_abierto\(\)/)
  assert.match(CODIGO, /BEFORE INSERT ON contabilidad\.apuntes\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.apunte_en_cuenta_hoja\(\)/)
  assert.match(CODIGO, /IF NEW\.ultimo_numero < OLD\.ultimo_numero THEN/)
  assert.match(CODIGO, /UNIQUE \(empresa_id, ejercicio, numero\)/)
  assert.match(CODIGO, /UNIQUE \(empresa_id, reversa_de\)/)
})

test('idempotencia de hechos: UNIQUE (empresa_id, origen_app, tipo, ref); contenido inmutable; nunca se borra', () => {
  assert.match(CODIGO, /UNIQUE \(empresa_id, origen_app, tipo, ref\)/)
  assert.match(CODIGO, /BEFORE UPDATE OR DELETE ON contabilidad\.hechos_contables/)
  assert.match(CODIGO, /OR NEW\.payload <> OLD\.payload OR NEW\.huella <> OLD\.huella/)
  assert.match(CODIGO, /GRANT UPDATE \(estado, motivo, asiento_id, actualizado_en\) ON contabilidad\.hechos_contables/)
})

test('consentimiento de seguros separado, fechado, solo-añadir (única modificación: la retirada)', () => {
  assert.match(CODIGO, /otorgado_en\s+timestamptz NOT NULL DEFAULT now\(\)/)
  assert.match(CODIGO, /BEFORE UPDATE OR DELETE ON contabilidad\.consentimiento_seguros/)
  assert.match(CODIGO, /GRANT UPDATE \(retirado_en, motivo_retirada, actualizado_en\) ON contabilidad\.consentimiento_seguros/)
})

test('SECURITY DEFINER: cada función fija search_path y se le quita PUBLIC (y solo la ejecuta el rol de la app)', () => {
  const defs = [...CODIGO.matchAll(/CREATE OR REPLACE FUNCTION (contabilidad\.\w+)\(([^)]*)\)[\s\S]*?\$\$;/g)]
  const definer = defs.filter((d) => /SECURITY DEFINER/.test(d[0]))
  assert.ok(definer.length >= 6, 'faltan funciones SECURITY DEFINER')
  const revocadas = /FOREACH f IN ARRAY ARRAY\[([\s\S]*?)\] LOOP\s+EXECUTE format\('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f\);\s+EXECUTE format\('GRANT EXECUTE ON FUNCTION %s TO prisma_contabilidad', f\)/.exec(CODIGO)
  assert.ok(revocadas, 'no está el REVOKE/GRANT de las funciones')
  for (const d of definer) {
    assert.match(d[0], /SECURITY DEFINER SET search_path = contabilidad, pg_temp/, `${d[1]} sin search_path fijo`)
    assert.ok(revocadas![1].includes(`'${d[1]}(`), `${d[1]} no tiene REVOKE de PUBLIC`)
  }
})

test('empresas y usuarios: la app NO los inserta (solo por las funciones del operador/login)', () => {
  assert.match(CODIGO, /GRANT SELECT ON contabilidad\.empresas, contabilidad\.usuarios TO prisma_contabilidad;/)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*INSERT[^;]*ON contabilidad\.(empresas|usuarios)\b/)
})
