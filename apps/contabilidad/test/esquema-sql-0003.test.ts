// Guardián ESTÁTICO de 0003_compras_banco.sql: RLS forzado por empresa en las 5 tablas, inmutabilidad de facturas/movimientos/conciliaciones,
// duplicado y huella únicos en BD, un movimiento = una conciliación, permisos mínimos y función de actividad SECURITY DEFINER acotada.
// Cepos vistos fallar el 05/11/2026: (1) quitar `UNIQUE (empresa_id, proveedor_nif, numero_norm)` → rojo en «duplicado»; (2) quitar
// `UNIQUE (empresa_id, movimiento_id)` → rojo en «un movimiento»; (3) `GRANT DELETE` sobre movimientos_banco → rojo en permisos. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '0003_compras_banco.sql'), 'utf8')
const CODIGO = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const TABLAS = ['proveedores', 'facturas_recibidas', 'movimientos_banco', 'conciliaciones', 'reglas_conciliacion']

test('las cinco tablas nacen con empresa_id NOT NULL y RLS ENABLE + FORCE con política por empresa_actual()', () => {
  for (const t of TABLAS) {
    const def = CODIGO.slice(CODIGO.indexOf(`CREATE TABLE contabilidad.${t} (`))
    assert.ok(def.length > 0, `falta ${t}`)
    assert.match(def.slice(0, def.indexOf('\n);')), /empresa_id\s+uuid NOT NULL REFERENCES contabilidad\.empresas\(id\)/, `${t} sin empresa_id`)
    assert.match(CODIGO, new RegExp(`'${t}'`))
  }
  assert.match(CODIGO, /ARRAY\['proveedores', 'facturas_recibidas', 'movimientos_banco', 'conciliaciones', 'reglas_conciliacion'\] LOOP\s+EXECUTE format\('ALTER TABLE contabilidad\.%I ENABLE ROW LEVEL SECURITY'/)
  assert.match(CODIGO, /FORCE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /USING \(empresa_id = contabilidad\.empresa_actual\(\)\) WITH CHECK \(empresa_id = contabilidad\.empresa_actual\(\)\)/)
})

test('duplicado de factura recibida y huella de movimiento: únicos en BD', () => {
  assert.match(CODIGO, /UNIQUE \(empresa_id, proveedor_nif, numero_norm\)/)
  assert.match(CODIGO, /UNIQUE \(empresa_id, huella\)/)
  assert.match(CODIGO, /uq_facturas_recibidas_mensaje ON contabilidad\.facturas_recibidas \(empresa_id, mensaje_id\) WHERE mensaje_id IS NOT NULL/)
})

test('un movimiento = una conciliación (nunca dos facturas), con FK compuestas al movimiento y al hecho', () => {
  assert.match(CODIGO, /UNIQUE \(empresa_id, movimiento_id\)/)
  assert.match(CODIGO, /FOREIGN KEY \(empresa_id, movimiento_id\) REFERENCES contabilidad\.movimientos_banco \(empresa_id, id\)/)
  assert.match(CODIGO, /FOREIGN KEY \(empresa_id, hecho_id\) REFERENCES contabilidad\.hechos_contables \(empresa_id, id\)/)
})

test('inmutables: facturas, movimientos y conciliaciones con trigger UPDATE/DELETE/TRUNCATE; las reglas solo se desactivan', () => {
  assert.match(CODIGO, /ARRAY\['facturas_recibidas', 'movimientos_banco', 'conciliaciones'\] LOOP/)
  assert.match(CODIGO, /BEFORE UPDATE OR DELETE ON contabilidad\.%I\s+FOR EACH ROW EXECUTE FUNCTION contabilidad\.prohibir_cambios\(\)/)
  assert.match(CODIGO, /BEFORE TRUNCATE ON contabilidad\.%I/)
  assert.match(CODIGO, /reglas_conciliacion no se borra: se desactiva/)
  assert.match(CODIGO, /\(NEW\.activa AND NOT OLD\.activa\)/, 'una regla desactivada no se reactiva')
})

test('permisos mínimos: SELECT/INSERT; UPDATE solo de columnas editables; nunca DELETE ni TRUNCATE ni ALL', () => {
  assert.match(CODIGO, /GRANT SELECT, INSERT ON contabilidad\.proveedores, contabilidad\.facturas_recibidas, contabilidad\.movimientos_banco,\s+contabilidad\.conciliaciones, contabilidad\.reglas_conciliacion TO prisma_contabilidad/)
  assert.match(CODIGO, /GRANT UPDATE \(nombre, tipo, categoria, retencion_pct, actualizado_en\) ON contabilidad\.proveedores/)
  assert.match(CODIGO, /GRANT UPDATE \(activa\) ON contabilidad\.reglas_conciliacion/)
  assert.match(CODIGO, /REVOKE DELETE, TRUNCATE ON/)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*\b(DELETE|TRUNCATE|ALL)\b[^;]*ON contabilidad\./i)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*\bUPDATE\b[^;(]*ON contabilidad\.(facturas_recibidas|movimientos_banco|conciliaciones)/i)
})

test('fijar_actividad: SECURITY DEFINER, search_path fijo, solo la empresa de la sesión, sin PUBLIC; la columna cnae valida 4 dígitos', () => {
  assert.match(CODIGO, /fijar_actividad\(p_empresa uuid, p_cnae text, p_sector text\)[\s\S]*SECURITY DEFINER SET search_path = contabilidad, pg_temp/)
  assert.match(CODIGO, /p_empresa IS DISTINCT FROM contabilidad\.empresa_actual\(\)/)
  assert.match(CODIGO, /REVOKE ALL ON FUNCTION contabilidad\.fijar_actividad\(uuid, text, text\) FROM PUBLIC/)
  assert.match(CODIGO, /GRANT EXECUTE ON FUNCTION contabilidad\.fijar_actividad\(uuid, text, text\) TO prisma_contabilidad/)
  assert.match(CODIGO, /ADD COLUMN cnae text CHECK \(cnae IS NULL OR cnae ~ '\^\[0-9\]\{4\}\$'\)/)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*ON contabilidad\.empresas/i, 'el rol sigue sin poder escribir en empresas')
})

test('sin float, sin contraseñas, sin tocar tablas de 0001 salvo añadir la columna cnae', () => {
  assert.doesNotMatch(CODIGO, /\b(numeric|real|double precision|float)\b/i)
  assert.doesNotMatch(CODIGO, /PASSWORD/i)
  const alter = [...CODIGO.matchAll(/ALTER TABLE contabilidad\.(\w+) (ADD|ENABLE|FORCE|DROP|ALTER)/g)].filter((m) => !TABLAS.includes(m[1]) && m[1] !== '%I')
  assert.deepEqual(alter.map((m) => m[0]), ['ALTER TABLE contabilidad.empresas ADD'])
})

test('importes en céntimos bigint: todos los *_cent son bigint', () => {
  const cols = [...CODIGO.matchAll(/^\s+(\w+_cent)\s+(\w+)/gm)]
  assert.ok(cols.length >= 6)
  for (const [, nombre, tipo] of cols) assert.equal(tipo, 'bigint', nombre)
})
