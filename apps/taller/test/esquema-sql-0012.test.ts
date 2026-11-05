// Cepos de 0012 (portal del proveedor), sin BD: lo que el fake no emula (SECURITY DEFINER, GRANT, RLS, CHECK) se vigila en el FUENTE.
// Vistos fallar (05/11/2026), uno por aserción, y restaurados:
// (1) quitar `SET search_path = taller, pg_temp` de la función → rojo «SECURITY DEFINER con search_path fijado».
// (2) quitar el `REVOKE ALL ON FUNCTION … FROM PUBLIC` → rojo «sin PUBLIC».
// (3) quitar `AND e.caduca_en > now()` → rojo «la función valida caducidad, revocación y cierre».
// (4) quitar 'documentos_proveedor' del ARRAY del bucle de RLS → rojo «RLS forzado».
// (5) quitar `case_cuadra IS TRUE OR` del CHECK de contabilizada → rojo «nunca se contabiliza sin case o persona».
// (6) cambiar el DEFAULT de portal_tol_total_cent a 5 → rojo «defaults ≡ TOLERANCIAS_POR_DEFECTO».
// (8) quitar `OR (OLD.estado = 'confirmada' AND NEW.estado = 'contabilizada')` → rojo «transiciones»; añadir 'contabilizada' a recibida → rojo «sin saltos».
// (7) añadir `, DELETE` al GRANT de las tablas nuevas → rojo «sin DELETE».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESTADOS_DOCUMENTO, TOLERANCIAS_POR_DEFECTO, puedeTransicionar } from '@central/module-portal-proveedor'

const RAIZ = join(import.meta.dirname, '..')
const SQL = readFileSync(join(RAIZ, 'prisma', 'sql', '0012_portal_proveedor.sql'), 'utf8')
const CODIGO = SQL.replace(/^\s*--.*$/gm, '').replace(/--[^\n']*$/gm, '')
const PRISMA = readFileSync(join(RAIZ, 'prisma', 'schema.prisma'), 'utf8')
const FUNCION = CODIGO.match(/CREATE OR REPLACE FUNCTION taller\.enlace_proveedor_por_hash[\s\S]*?\$\$;/)?.[0] ?? ''

test('0012: una transacción, idempotente, FK compuestas por taller', () => {
  assert.match(CODIGO, /^BEGIN;$/m)
  assert.match(CODIGO, /^COMMIT;$/m)
  assert.equal([...CODIGO.matchAll(/CREATE TABLE(?! IF NOT EXISTS)/g)].length, 0)
  assert.equal([...CODIGO.matchAll(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g)].length, 0)
  assert.match(CODIGO, /FOREIGN KEY \(taller_id, enlace_id\)\s+REFERENCES taller\.enlaces_proveedor\(taller_id, id\)/)
  assert.match(CODIGO, /FOREIGN KEY \(taller_id, albaran_id\)\s+REFERENCES taller\.albaranes\(taller_id, id\)/)
})

test('0012: SECURITY DEFINER con search_path fijado', () => {
  assert.match(FUNCION, /SECURITY DEFINER SET search_path = taller, pg_temp/)
})
test('0012: sin PUBLIC', () => {
  assert.match(CODIGO, /REVOKE ALL ON FUNCTION taller\.enlace_proveedor_por_hash\(text\) FROM PUBLIC;/)
  assert.match(CODIGO, /GRANT EXECUTE ON FUNCTION taller\.enlace_proveedor_por_hash\(text\) TO prisma_taller;/)
})
test('0012: la función valida caducidad, revocación y cierre, recibe el HASH y devuelve solo ids y propósito', () => {
  assert.match(FUNCION, /e\.token_hash = p_hash/)
  assert.match(FUNCION, /AND e\.caduca_en > now\(\)/)
  assert.match(FUNCION, /AND e\.revocado_en IS NULL/)
  assert.match(FUNCION, /AND e\.cerrado_en IS NULL/)
  assert.match(FUNCION, /t\.activo/)
  assert.match(FUNCION, /RETURNS TABLE \(o_taller uuid, o_enlace uuid, o_proposito text\)/)
  // el token en claro no existe en el esquema
  assert.doesNotMatch(CODIGO, /\btoken\s+text\b/)
})
test('0012: RLS forzado en las tablas nuevas', () => {
  assert.match(CODIGO, /FOREACH t IN ARRAY ARRAY\['enlaces_proveedor', 'documentos_proveedor'\] LOOP[\s\S]*?FORCE ROW LEVEL SECURITY/)
})
test('0012: nunca se contabiliza sin case o persona (CHECK) y «lista» exige case', () => {
  assert.match(CODIGO, /documentos_proveedor_contabilizada_chk CHECK \(\s*estado <> 'contabilizada' OR \(contabilizado_en IS NOT NULL AND \(case_cuadra IS TRUE OR confirmado_por IS NOT NULL\)\)\)/)
  assert.match(CODIGO, /documentos_proveedor_lista_chk CHECK \(estado <> 'lista' OR case_cuadra IS TRUE\)/)
  assert.match(CODIGO, /documentos_proveedor_confirmada_chk CHECK \(estado <> 'confirmada' OR \(confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL\)\)/)
})
test('0012: estados del documento = módulo', () => {
  const m = CODIGO.match(/estado\s+text NOT NULL CHECK \(estado IN \(([^)]*)\)\)/)
  assert.ok(m)
  assert.deepEqual([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort(), [...ESTADOS_DOCUMENTO].sort())
})
test('0012: defaults ≡ TOLERANCIAS_POR_DEFECTO (y Prisma igual)', () => {
  const def = (col: string) => Number(CODIGO.match(new RegExp(`${col} integer NOT NULL DEFAULT (\\d+)`))?.[1])
  assert.equal(def('portal_tol_precio_cent'), TOLERANCIAS_POR_DEFECTO.precioUnitCent)
  assert.equal(def('portal_tol_precio_pb'), TOLERANCIAS_POR_DEFECTO.precioPb)
  assert.equal(def('portal_tol_importe_linea_cent'), TOLERANCIAS_POR_DEFECTO.importeLineaCent)
  assert.equal(def('portal_tol_total_cent'), TOLERANCIAS_POR_DEFECTO.totalCent)
  assert.equal(def('portal_tol_cantidad_mil'), TOLERANCIAS_POR_DEFECTO.cantidadMil)
  assert.match(PRISMA, /portalTolTotalCent\s+Int\s+@default\(2\)/)
  assert.match(PRISMA, /model EnlaceProveedor \{[\s\S]*?@@map\("enlaces_proveedor"\)/)
  assert.match(PRISMA, /model DocumentoProveedor \{[\s\S]*?@@map\("documentos_proveedor"\)/)
})
test('0012: sin DELETE para el rol de la app', () => {
  assert.match(CODIGO, /REVOKE ALL ON taller\.enlaces_proveedor, taller\.documentos_proveedor FROM prisma_taller;/)
  assert.match(CODIGO, /GRANT SELECT, INSERT ON taller\.enlaces_proveedor, taller\.documentos_proveedor TO prisma_taller;/)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*DELETE[^;]*(enlaces_proveedor|documentos_proveedor)/)
})

test('0012: el trigger valida transiciones de estado (espejo del módulo) y no deja saltar a «contabilizada»', () => {
  const trg = CODIGO.match(/CREATE OR REPLACE FUNCTION taller\.documentos_proveedor_inmutables[\s\S]*?\$\$;/)?.[0] ?? ''
  assert.match(trg, /transición de estado no permitida/)
  const permitidas = [...trg.matchAll(/OLD\.estado = '(\w+)'\s+AND NEW\.estado (?:IN \(([^)]*)\)|= '(\w+)')/g)]
  const mapa = new Map(permitidas.map((x) => [x[1], [...(x[2] ?? `'${x[3]}'`).matchAll(/'(\w+)'/g)].map((y) => y[1]).sort()]))
  assert.deepEqual(Object.fromEntries(mapa), {
    recibido: ['verificado'], recibida: ['extraida', 'ilegible', 'rechazada'], extraida: ['lista', 'revisar'],
    ilegible: ['extraida', 'rechazada', 'revisar'], lista: ['contabilizada', 'revisar'], revisar: ['confirmada', 'lista', 'rechazada'], confirmada: ['contabilizada'],
  })
  for (const [desde, hacias] of mapa) for (const h of hacias) {
    if (desde === 'recibido') continue
    assert.ok(puedeTransicionar('factura', desde, h), `${desde} → ${h} debe existir en el módulo`)
  }
  assert.ok(!mapa.get('recibida')?.includes('contabilizada'))
})
