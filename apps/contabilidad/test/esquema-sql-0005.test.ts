// Guardián ESTÁTICO de 0005_cierre.sql: RLS forzado por empresa en las cuatro tablas, ejercicio cerrado definitivo, cierre solo con 6/7 a cero y
// apertura ≡ cierre, fichas inmutables salvo la baja, tablas solo-añadir, índice único de asientos F5, permisos mínimos (nunca DELETE/TRUNCATE).
// Cepos vistos fallar el 05/11/2026: (1) quitar el `RAISE` de «OLD.estado = 'cerrado'» → rojo en «cerrado es definitivo»; (2) `GRANT DELETE` → rojo
// en permisos; (3) quitar `FORCE ROW LEVEL SECURITY` de la lista → rojo en RLS. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '0005_cierre.sql'), 'utf8')
const CODIGO = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const TABLAS = ['activos_fijos', 'amortizacion_tabla', 'periodificaciones', 'cierres_ejercicio']

test('las cuatro tablas llevan empresa_id NOT NULL y RLS ENABLE + FORCE con política por empresa_actual()', () => {
  for (const t of TABLAS) {
    const def = CODIGO.slice(CODIGO.indexOf(`CREATE TABLE contabilidad.${t} (`))
    assert.match(def.slice(0, def.indexOf('\n);')), /empresa_id\s+uuid NOT NULL REFERENCES contabilidad\.empresas\(id\)/, t)
  }
  assert.match(CODIGO, /FOREACH t IN ARRAY ARRAY\['activos_fijos', 'amortizacion_tabla', 'periodificaciones', 'cierres_ejercicio'\]/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.%I ENABLE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /ALTER TABLE contabilidad\.%I FORCE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /USING \(empresa_id = contabilidad\.empresa_actual\(\)\) WITH CHECK \(empresa_id = contabilidad\.empresa_actual\(\)\)/)
})

test('importes en céntimos enteros (bigint), sin float ni numeric; porcentajes en puntos básicos enteros', () => {
  for (const c of ['valor_cent', 'residual_cent', 'precio_venta_cent', 'resultado_baja_cent', 'importe_cent', 'resultado_cent']) assert.match(CODIGO, new RegExp(`${c}\\s+bigint`), c)
  assert.doesNotMatch(CODIGO, /\b(float|double precision|real|numeric|decimal|money)\b/i)
  assert.match(CODIGO, /porcentaje_pb\s+integer NOT NULL CHECK \(porcentaje_pb BETWEEN 1 AND 10000\)/)
})

test('ficha de activo: valor > 0, residual < valor, baja coherente y única por (empresa, origen, ref_externa)', () => {
  assert.match(CODIGO, /valor_cent\s+bigint NOT NULL CHECK \(valor_cent > 0\)/)
  assert.match(CODIGO, /CHECK \(residual_cent < valor_cent\)/)
  assert.match(CODIGO, /CHECK \(\(estado = 'baja'\) = \(fecha_baja IS NOT NULL\)\)/)
  assert.match(CODIGO, /UNIQUE \(empresa_id, origen, ref_externa\)/)
  assert.match(CODIGO, /metodo\s+text NOT NULL DEFAULT 'lineal' CHECK \(metodo = 'lineal'\)/)
})

test('activos_fijos: identidad e importes inmutables, baja definitiva, nada se borra', () => {
  assert.match(CODIGO, /TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION 'contabilidad\.activos_fijos no se borra/)
  assert.match(CODIGO, /NEW\.valor_cent <> OLD\.valor_cent/)
  assert.match(CODIGO, /OLD\.estado = 'baja' THEN\s+RAISE EXCEPTION/)
  assert.match(CODIGO, /BEFORE UPDATE OR DELETE ON contabilidad\.activos_fijos\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.activos_fijos_ciclo\(\)/)
  assert.match(CODIGO, /BEFORE TRUNCATE ON contabilidad\.activos_fijos/)
})

test('amortizacion_tabla, periodificaciones y cierres_ejercicio son solo-añadir (trigger de inmutabilidad + sin TRUNCATE)', () => {
  for (const t of ['amortizacion_tabla', 'periodificaciones', 'cierres_ejercicio']) {
    assert.match(CODIGO, new RegExp(`BEFORE UPDATE OR DELETE ON contabilidad\\.${t}\\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\\.prohibir_cambios\\(\\)`), t)
    assert.match(CODIGO, new RegExp(`BEFORE TRUNCATE ON contabilidad\\.${t}`), t)
  }
})

test('ejercicio CERRADO es definitivo y solo se cierra con registro de cierre y las cuentas 6/7 a cero', () => {
  assert.match(CODIGO, /OLD\.estado = 'cerrado' THEN\s+RAISE EXCEPTION/)
  assert.match(CODIGO, /FROM contabilidad\.cierres_ejercicio c WHERE c\.empresa_id = NEW\.empresa_id AND c\.anio = NEW\.anio/)
  assert.match(CODIGO, /p\.cuenta ~ '\^\[67\]'\s+GROUP BY p\.cuenta HAVING sum\(p\.debe\) <> sum\(p\.haber\)/)
  assert.match(CODIGO, /BEFORE UPDATE ON contabilidad\.ejercicios\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.ejercicio_estado_valido\(\)/)
})

test('apertura ≡ cierre exigido por la BD al registrar el cierre; cierre y apertura van juntos', () => {
  assert.match(CODIGO, /GROUP BY p\.cuenta HAVING sum\(p\.haber - p\.debe\) <> 0/)
  assert.match(CODIGO, /BEFORE INSERT ON contabilidad\.cierres_ejercicio\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.cierre_apertura_igual\(\)/)
  assert.match(CODIGO, /UNIQUE \(empresa_id, anio\)/)
})

test('cierres_ejercicio: cierre y apertura NOT NULL (la regularización puede faltar) y pertenecen al año que toca', () => {
  const def = CODIGO.slice(CODIGO.indexOf('CREATE TABLE contabilidad.cierres_ejercicio ('))
  const tabla = def.slice(0, def.indexOf('\n);'))
  assert.match(tabla, /asiento_cierre_id\s+uuid NOT NULL/)
  assert.match(tabla, /asiento_apertura_id\s+uuid NOT NULL/)
  assert.match(tabla, /asiento_regularizacion_id\s+uuid,/)
  assert.doesNotMatch(tabla, /asiento_(cierre|apertura)_id IS NULL/)
  const fn = CODIGO.slice(CODIGO.indexOf('FUNCTION contabilidad.cierre_apertura_igual'), CODIGO.indexOf('CREATE TRIGGER trg_cierres_ejercicio_apertura_igual'))
  assert.match(fn, /a\.id = NEW\.asiento_cierre_id\s+AND a\.ejercicio = NEW\.anio AND a\.origen = 'cierre'/)
  assert.match(fn, /a\.id = NEW\.asiento_apertura_id\s+AND a\.ejercicio = NEW\.anio \+ 1 AND a\.origen = 'apertura'/)
  assert.match(fn, /a\.id = NEW\.asiento_regularizacion_id\s+AND a\.ejercicio = NEW\.anio AND a\.origen = 'cierre'/)
})

test('un ejercicio cerrado no admite apuntes: trigger BEFORE INSERT/UPDATE en apuntes que mira el estado del ejercicio del asiento', () => {
  assert.match(CODIGO, /BEFORE INSERT OR UPDATE ON contabilidad\.apuntes\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.apunte_en_ejercicio_abierto\(\)/)
  const fn = CODIGO.slice(CODIGO.indexOf('FUNCTION contabilidad.apunte_en_ejercicio_abierto'), CODIGO.indexOf('CREATE TRIGGER trg_apuntes_ejercicio_abierto'))
  assert.match(fn, /JOIN contabilidad\.ejercicios e ON e\.empresa_id = a\.empresa_id AND e\.anio = a\.ejercicio/)
  assert.match(fn, /v_estado IS DISTINCT FROM 'abierto' THEN\s+RAISE EXCEPTION/)
})

test('ejercicios: anio = año de inicio (CHECK) y sin solapes entre ejercicios de la misma empresa (trigger con bloqueo)', () => {
  assert.match(CODIGO, /ALTER TABLE contabilidad\.ejercicios ADD CONSTRAINT \w+ CHECK \(anio = extract\(year FROM inicio\)::int\)/)
  assert.match(CODIGO, /BEFORE INSERT OR UPDATE OF inicio, fin ON contabilidad\.ejercicios\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.ejercicio_sin_solape\(\)/)
  const fn = CODIGO.slice(CODIGO.indexOf('FUNCTION contabilidad.ejercicio_sin_solape'), CODIGO.indexOf('CREATE TRIGGER trg_ejercicios_sin_solape'))
  assert.match(fn, /pg_advisory_xact_lock/)
  assert.match(fn, /x\.empresa_id = NEW\.empresa_id AND x\.id <> NEW\.id AND x\.inicio <= NEW\.fin AND x\.fin >= NEW\.inicio/)
})

test('un asiento de amortización/periodificación/cierre/apertura se asienta UNA vez por periodo, salvo que el anterior esté rectificado (trigger, 23505)', () => {
  assert.doesNotMatch(CODIGO, /CREATE UNIQUE INDEX uq_asientos_origen_f5/)
  assert.match(CODIGO, /BEFORE INSERT ON contabilidad\.asientos\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.asiento_origen_f5_unico\(\)/)
  const fn = CODIGO.slice(CODIGO.indexOf('FUNCTION contabilidad.asiento_origen_f5_unico'), CODIGO.indexOf('CREATE TRIGGER trg_asientos_origen_f5_unico'))
  assert.match(fn, /NEW\.origen_tipo IN \('amortizacion', 'periodificacion', 'cierre', 'apertura'\)/)
  assert.match(fn, /pg_advisory_xact_lock/)
  assert.match(fn, /NOT EXISTS \(SELECT 1 FROM contabilidad\.asientos r WHERE r\.empresa_id = a\.empresa_id AND r\.reversa_de = a\.id\)/)
  assert.match(fn, /ERRCODE = '23505'/)
})

test('FK compuestas a asientos de la MISMA empresa', () => {
  for (const c of ['asiento_alta_id', 'asiento_baja_id', 'asiento_regularizacion_id', 'asiento_cierre_id', 'asiento_apertura_id']) {
    assert.match(CODIGO, new RegExp(`FOREIGN KEY \\(empresa_id, ${c}\\) REFERENCES contabilidad\\.asientos \\(empresa_id, id\\)`), c)
  }
})

test('cuentas 671 y 771 añadidas al plan de las empresas existentes sin pisar las que ya tengan', () => {
  assert.match(CODIGO, /INSERT INTO contabilidad\.plan_cuentas/)
  assert.match(CODIGO, /'671'.*'deudora'/)
  assert.match(CODIGO, /'771'.*'acreedora'/)
  assert.match(CODIGO, /ON CONFLICT \(empresa_id, codigo\) DO NOTHING/)
})

test('permisos mínimos: SELECT/INSERT, UPDATE solo de baja (activos) y de estado (ejercicios); jamás DELETE/TRUNCATE/ALL', () => {
  assert.match(CODIGO, /GRANT SELECT, INSERT ON contabilidad\.activos_fijos TO prisma_contabilidad/)
  const upd = CODIGO.match(/GRANT UPDATE \(([^)]*)\) ON contabilidad\.activos_fijos/)![1].split(',').map((x) => x.trim())
  for (const prohibida of ['id', 'empresa_id', 'ref', 'valor_cent', 'porcentaje_pb', 'fecha_alta', 'origen', 'ref_externa']) assert.ok(!upd.includes(prohibida), `UPDATE no debe incluir ${prohibida}`)
  for (const necesaria of ['estado', 'fecha_baja', 'asiento_baja_id']) assert.ok(upd.includes(necesaria), `UPDATE debe incluir ${necesaria}`)
  assert.match(CODIGO, /GRANT UPDATE \(estado\) ON contabilidad\.ejercicios TO prisma_contabilidad/)
  assert.match(CODIGO, /REVOKE DELETE, TRUNCATE ON contabilidad\.activos_fijos, contabilidad\.amortizacion_tabla, contabilidad\.periodificaciones, contabilidad\.cierres_ejercicio FROM prisma_contabilidad/)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*\b(DELETE|TRUNCATE|ALL)\b[^;]*ON contabilidad\./i)
})

test('es ADITIVA (sin DROP ni ALTER de columnas), va en una transacción y NO está aplicada (la cabecera lo dice)', () => {
  assert.doesNotMatch(CODIGO, /\bDROP\b/i)
  assert.doesNotMatch(CODIGO, /ALTER TABLE contabilidad\.(asientos|apuntes|ejercicios|plan_cuentas)\s+(ADD COLUMN|DROP|ALTER COLUMN)/i)
  assert.match(CODIGO, /^\s*BEGIN;/m)
  assert.match(CODIGO, /COMMIT;\s*$/m)
  assert.match(SQL, /NO APLICADA/)
})
