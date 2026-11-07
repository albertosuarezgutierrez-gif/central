// Cepos de 0013 (traza del vencimiento del seguro), sin BD: se vigila el FUENTE.
// Visto fallar (07/11/2026) y restaurado: añadir 'cita' al CHECK de origen → rojo «origen ≡ módulo».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGENES_VENCIMIENTO_SEGURO } from '@central/module-taller'

const RAIZ = join(import.meta.dirname, '..')
const SQL = readFileSync(join(RAIZ, 'prisma', 'sql', '0013_vencimiento_seguro_vehiculo.sql'), 'utf8')
const CODIGO = SQL.replace(/^\s*--.*$/gm, '').replace(/--[^\n']*$/gm, '')
const PRISMA = readFileSync(join(RAIZ, 'prisma', 'schema.prisma'), 'utf8')

test('0013: una transacción, idempotente y ADITIVA (sin DROP, sin DELETE, sin tocar RLS)', () => {
  assert.match(CODIGO, /^BEGIN;$/m)
  assert.match(CODIGO, /^COMMIT;$/m)
  assert.equal([...CODIGO.matchAll(/ADD COLUMN(?! IF NOT EXISTS)/g)].length, 0)
  assert.doesNotMatch(CODIGO, /\bDROP\b|\bDELETE\b|ROW LEVEL SECURITY|POLICY|DEFAULT|UPDATE taller\./)
  assert.equal([...CODIGO.matchAll(/ADD CONSTRAINT (\w+)/g)].length, [...CODIGO.matchAll(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint/g)].length)
})
test('0013: quién lo puso es un usuario DEL MISMO taller (FK compuesta)', () => {
  assert.match(CODIGO, /FOREIGN KEY \(taller_id, seguro_hasta_por\) REFERENCES taller\.usuarios_taller\(taller_id, id\)/)
})
test('0013: origen ≡ módulo', () => {
  const m = CODIGO.match(/seguro_hasta_origen IN \(([^)]*)\)/)
  assert.ok(m)
  assert.deepEqual([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort(), [...ORIGENES_VENCIMIENTO_SEGURO].sort())
})
test('0013: GRANT de UPDATE solo de las columnas del seguro a prisma_taller', () => {
  assert.match(CODIGO, /GRANT UPDATE \(seguro_hasta, seguro_hasta_por, seguro_hasta_en, seguro_hasta_origen, actualizado_en\) ON taller\.vehiculos TO prisma_taller;/)
})
test('0013: schema.prisma conoce las columnas nuevas', () => {
  for (const c of ['seguro_hasta_por', 'seguro_hasta_en', 'seguro_hasta_origen']) assert.match(PRISMA, new RegExp(`@map\\("${c}"\\)`))
})
