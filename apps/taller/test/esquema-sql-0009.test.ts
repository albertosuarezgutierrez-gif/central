// Cepos de 0009 (facturación VeriFactu), sin BD: lo que el fake no puede emular (triggers, GRANT, RLS) se vigila en el FUENTE SQL.
// Vistos fallar (04/11/2026), uno por aserción, y restaurados:
// (1) quitar 'cobros' del ARRAY del bucle de RLS → rojo «RLS forzado en las cinco tablas».
// (2) añadir `, total_cent` al GRANT UPDATE de facturas → rojo «UPDATE solo de columnas de estado».
// (3) cambiar `>= 100000` por `>= 1000000` en cobros_validos → rojo «espejo del límite de efectivo».
// (4) quitar `OR DELETE` del trigger de facturas → rojo «triggers de inmutabilidad».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESTADOS_ENVIO_AEAT, ESTADOS_FACTURA, LIMITE_EFECTIVO_CENT, TIPOS_FACTURA_TALLER } from '@central/module-taller'

const RAIZ = join(import.meta.dirname, '..')
const S9 = readFileSync(join(RAIZ, 'prisma', 'sql', '0009_facturas_cobros.sql'), 'utf8')
const CODIGO = S9.replace(/^\s*--.*$/gm, '').replace(/--[^\n']*$/gm, '')
const PRISMA = readFileSync(join(RAIZ, 'prisma', 'schema.prisma'), 'utf8')
const APP = readFileSync(join(RAIZ, 'lib', 'facturas.ts'), 'utf8')
const TABLAS = ['contadores_factura', 'facturas', 'factura_lineas', 'registros_verifactu', 'cobros']
const cuerpo = (t: string) => {
  const m = CODIGO.match(new RegExp(`CREATE TABLE IF NOT EXISTS taller\\.${t} \\(([\\s\\S]*?)\\n\\);`))
  assert.ok(m, `no encuentro CREATE TABLE ${t}`)
  return m[1]
}
const lista = (re: RegExp) => {
  const m = CODIGO.match(re)
  assert.ok(m, String(re))
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('0009: transacción, tablas idempotentes y taller_id NOT NULL en todas', () => {
  assert.match(CODIGO, /^BEGIN;$/m)
  assert.match(CODIGO, /^COMMIT;$/m)
  for (const t of TABLAS) assert.match(cuerpo(t), /^\s*taller_id\s+uuid NOT NULL/m, t)
  assert.equal([...CODIGO.matchAll(/CREATE TABLE(?! IF NOT EXISTS)/g)].length, 0)
  assert.equal([...CODIGO.matchAll(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g)].length, 0)
})

test('0009: RLS forzado en las cinco tablas con la política por taller de siempre', () => {
  const m = CODIGO.match(/FOREACH t IN ARRAY ARRAY\[([^\]]+)\] LOOP/)
  assert.ok(m)
  assert.deepEqual([...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort(), [...TABLAS].sort())
  assert.match(CODIGO, /ENABLE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /FORCE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /USING \(taller_id = taller\.taller_actual\(\)\) WITH CHECK \(taller_id = taller\.taller_actual\(\)\)/)
})

test('0009: GRANT mínimos — SELECT/INSERT; UPDATE solo de columnas de estado; nada de DELETE', () => {
  assert.match(CODIGO, new RegExp(`REVOKE ALL ON ${TABLAS.map((t) => `taller\\.${t}`).join(', ')} FROM prisma_taller;`))
  assert.match(CODIGO, new RegExp(`GRANT SELECT, INSERT ON ${TABLAS.map((t) => `taller\\.${t}`).join(', ')} TO prisma_taller;`))
  const updates = [...CODIGO.matchAll(/GRANT UPDATE \(([^)]*)\) ON taller\.(\w+) TO prisma_taller;/g)].map((x) => [x[2], x[1]])
  assert.deepEqual(Object.fromEntries(updates), {
    contadores_factura: 'ultimo_numero, actualizado_en',
    facturas: 'estado, anulada_en, motivo_anulacion, estado_envio, actualizado_en',
    registros_verifactu: 'estado_envio, actualizado_en',
  })
  assert.doesNotMatch(CODIGO, /GRANT[^;]*(DELETE|TRUNCATE|ALL)[^;]*TO prisma_taller/)
  assert.doesNotMatch(CODIGO, /GRANT UPDATE ON/)
})

test('0009: triggers de inmutabilidad (UPDATE y DELETE) en facturas, líneas, registros y cobros', () => {
  for (const [t, f] of [['facturas', 'facturas_inmutable'], ['factura_lineas', 'solo_insertar'], ['registros_verifactu', 'registros_verifactu_inmutable'], ['cobros', 'solo_insertar']]) {
    assert.match(CODIGO, new RegExp(`BEFORE UPDATE OR DELETE ON taller\\.${t}\\s+FOR EACH ROW EXECUTE FUNCTION taller\\.${f}\\(\\)`), t)
  }
  // Lo único que cambia de una factura: estado y envío.
  assert.match(CODIGO, /libres text\[\] := ARRAY\['estado','anulada_en','motivo_anulacion','estado_envio','actualizado_en'\]/)
  assert.match(CODIGO, /libres text\[\] := ARRAY\['estado_envio','actualizado_en'\]/)
  assert.match(CODIGO, /no se anula sin su registro de anulación VeriFactu/)
})

test('0009: correlatividad, fecha que no retrocede y cadena encadenada bajo el MISMO candado que la app', () => {
  const candados = [...CODIGO.matchAll(/pg_advisory_xact_lock\(hashtext\('factura:' \|\| NEW\.taller_id::text\)\)/g)]
  assert.equal(candados.length, 2, 'correlativa + cadena')
  assert.match(APP, /pg_advisory_xact_lock\(hashtext\(\$\{'factura:' \+ tallerId\}\)\)/, 'la app usa la misma clave')
  assert.match(CODIGO, /IF NEW\.numero <> coalesce\(v_ultimo, 0\) \+ 1 THEN/)
  assert.match(CODIGO, /NEW\.fecha_expedicion < v_fecha/)
  assert.match(CODIGO, /NEW\.secuencia <> v_sec \+ 1 OR NEW\.huella_anterior IS DISTINCT FROM v_huella/)
  assert.match(cuerpo('registros_verifactu'), /CHECK \(\(secuencia = 1\) = \(huella_anterior IS NULL\)\)/)
  assert.match(cuerpo('facturas'), /UNIQUE \(taller_id, serie_id, anio, numero\)/)
  assert.match(CODIGO, /ux_facturas_ot_viva ON taller\.facturas \(taller_id, ot_id\) WHERE estado = 'emitida' AND tipo IN \('F1','F2'\)/)
  assert.match(CODIGO, /NEW\.ultimo_numero <> OLD\.ultimo_numero \+ 1/, 'el contador solo sube de uno en uno')
})

test('0009: espejos TS ↔ SQL (tipos, estados, envío y límite de efectivo)', () => {
  assert.deepEqual(lista(/tipo\s+text NOT NULL CHECK \(tipo IN \(([^)]*)\)\)/), [...TIPOS_FACTURA_TALLER])
  assert.deepEqual(lista(/estado\s+text NOT NULL DEFAULT 'emitida' CHECK \(estado IN \(([^)]*)\)\)/), [...ESTADOS_FACTURA])
  for (const m of CODIGO.matchAll(/estado_envio\s+text NOT NULL DEFAULT 'no_enviado' CHECK \(estado_envio IN \(([^)]*)\)\)/g)) {
    assert.deepEqual([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]), [...ESTADOS_ENVIO_AEAT])
  }
  assert.equal(Number(CODIGO.match(/v_efectivo \+ NEW\.importe_cent >= (\d+)/)?.[1]), LIMITE_EFECTIVO_CENT)
})

test('0009: el esqueleto de 0001 solo se retira si está VACÍO y mirando sin RLS (no ve 0 filas por error)', () => {
  const i = CODIGO.indexOf('SET LOCAL row_security = off;')
  const j = CODIGO.indexOf('DROP TABLE taller.facturas;')
  assert.ok(i >= 0 && j > i)
  assert.match(CODIGO.slice(i, j), /IF EXISTS \(SELECT 1 FROM taller\.cobros\) OR EXISTS \(SELECT 1 FROM taller\.facturas\) THEN\s+RAISE EXCEPTION/)
  assert.match(CODIGO, /SET LOCAL row_security = on;/)
})

test('0009: Prisma modela las cinco tablas en el schema taller', () => {
  for (const t of TABLAS) assert.match(PRISMA, new RegExp(`@@map\\("${t}"\\)\\s+@@schema\\("taller"\\)`), t)
})
