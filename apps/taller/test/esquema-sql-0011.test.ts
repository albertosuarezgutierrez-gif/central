// Cepos de 0011 (stock, pedidos, albaranes), sin BD: lo que el fake no puede emular (triggers, GRANT, RLS, CHECK) se vigila en el FUENTE SQL.
// Vistos fallar (05/11/2026), uno por aserción, y restaurados:
// (1) quitar el trigger `trg_movimientos_stock_solo_insertar` → rojo «movimientos_stock es SOLO-AÑADIR».
// (2) quitar `, UPDATE` del REVOKE de movimientos_stock → rojo «sin UPDATE ni DELETE».
// (3) quitar `'albaran_lineas'` del ARRAY del bucle de RLS → rojo «RLS forzado en las tablas nuevas».
// (4) quitar `'compra'` del CHECK de hechos_pendientes → rojo «outbox admite compra».
// (5) quitar la línea `UNIQUE (taller_id, proveedor_id, numero_proveedor)` → rojo «mismo albarán no entra dos veces».
// (6) quitar `AND length(btrim(coalesce(nota, ''))) > 0` → rojo «ajuste exige motivo».
// (7) añadir 'borrador' a los estados de Prisma sin 'parcial' en el CHECK de pedidos → rojo «estados del pedido = módulo».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESTADOS_PEDIDO, MOTIVOS_MOVIMIENTO } from '@central/module-taller'

const RAIZ = join(import.meta.dirname, '..')
const SQL = readFileSync(join(RAIZ, 'prisma', 'sql', '0011_stock_pedidos.sql'), 'utf8')
const CODIGO = SQL.replace(/^\s*--.*$/gm, '').replace(/--[^\n']*$/gm, '')
const PRISMA = readFileSync(join(RAIZ, 'prisma', 'schema.prisma'), 'utf8')
const lista = (re: RegExp) => {
  const m = CODIGO.match(re)
  assert.ok(m, String(re))
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('0011: una transacción, idempotente y con las FK compuestas por taller', () => {
  assert.match(CODIGO, /^BEGIN;$/m)
  assert.match(CODIGO, /^COMMIT;$/m)
  assert.equal([...CODIGO.matchAll(/CREATE TABLE(?! IF NOT EXISTS)/g)].length, 0)
  assert.equal([...CODIGO.matchAll(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g)].length, 0)
  for (const t of ['albaranes', 'albaran_lineas']) assert.match(CODIGO, new RegExp(`CREATE TABLE IF NOT EXISTS taller\\.${t} \\([\\s\\S]*?taller_id\\s+uuid NOT NULL`), t)
  assert.match(CODIGO, /FOREIGN KEY \(taller_id, proveedor_id\) REFERENCES taller\.proveedores\(taller_id, id\)/)
  assert.match(CODIGO, /FOREIGN KEY \(taller_id, articulo_id\)\s+REFERENCES taller\.articulos\(taller_id, id\)/)
  assert.match(CODIGO, /FOREIGN KEY \(taller_id, pedido_linea_id\) REFERENCES taller\.pedido_lineas\(taller_id, id\)/)
})

test('0011: movimientos_stock es SOLO-AÑADIR (trigger) y sin UPDATE ni DELETE para el rol', () => {
  assert.match(CODIGO, /CREATE TRIGGER trg_movimientos_stock_solo_insertar\s+BEFORE UPDATE OR DELETE ON taller\.movimientos_stock\s+FOR EACH ROW EXECUTE FUNCTION taller\.solo_insertar\(\)/)
  assert.match(CODIGO, /REVOKE UPDATE, DELETE ON taller\.movimientos_stock FROM prisma_taller;/)
})

test('0011: el ajuste de inventario exige motivo escrito y el signo de cada movimiento se valida', () => {
  assert.match(CODIGO, /motivo = 'ajuste_inventario' AND length\(btrim\(coalesce\(nota, ''\)\)\) > 0/)
  assert.match(CODIGO, /motivo = 'entrada_albaran'\s+AND cantidad > 0/)
  assert.match(CODIGO, /motivo IN \('consumo_ot', 'consumo_ot_extra'\) AND cantidad < 0 AND ot_id IS NOT NULL/)
  assert.match(CODIGO, /motivo = 'devolucion_ot'\s+AND cantidad > 0 AND ot_id IS NOT NULL/)
  // Los motivos del CHECK = los del módulo (un motivo nuevo en el código sin SQL fallaría en BD).
  const enSql = [...CODIGO.matchAll(/motivo (?:=|IN \() ?'([a-z_]+)'(?:, '([a-z_]+)')?/g)].flatMap((x) => [x[1], x[2]]).filter(Boolean)
  assert.deepEqual([...new Set(enSql)].sort(), [...MOTIVOS_MOVIMIENTO].sort())
})

test('0011: estados del pedido = los del módulo; «enviado» exige quién y cuándo', () => {
  assert.deepEqual(lista(/pedidos_estado_chk\s+CHECK \(estado IN \(([^)]+)\)\)/).sort(), [...ESTADOS_PEDIDO].sort())
  assert.match(CODIGO, /CHECK \(estado IN \('borrador', 'cancelado'\) OR \(enviado_por IS NOT NULL AND enviado_en IS NOT NULL\)\)/)
  assert.match(PRISMA, /model Pedido \{[\s\S]*?estado\s+String\s+@default\("borrador"\)/)
})

test('0011: el mismo albarán no entra dos veces (único por proveedor y número) y las líneas no se editan', () => {
  assert.match(CODIGO, /UNIQUE \(taller_id, proveedor_id, numero_proveedor\)/)
  assert.match(CODIGO, /CREATE TRIGGER trg_albaran_lineas_inmutables\s+BEFORE UPDATE ON taller\.albaran_lineas/)
  assert.match(CODIGO, /CREATE TRIGGER trg_albaranes_inmutables\s+BEFORE UPDATE OR DELETE ON taller\.albaranes/)
  // Solo se puede valorar: UPDATE de coste/IVA en líneas; estado/factura en el albarán; nada de DELETE.
  assert.match(CODIGO, /GRANT UPDATE \(coste_unitario_cent, iva_puntos_basicos, actualizado_en\) ON taller\.albaran_lineas TO prisma_taller;/)
  assert.match(CODIGO, /GRANT UPDATE \(estado, factura_proveedor_numero, factura_proveedor_fecha, valorado_en, actualizado_en\) ON taller\.albaranes TO prisma_taller;/)
  assert.match(CODIGO, /GRANT SELECT, INSERT ON taller\.albaranes, taller\.albaran_lineas TO prisma_taller;/)
  assert.doesNotMatch(CODIGO, /GRANT[^;]*DELETE[^;]*albaran/)
})

test('0011: RLS forzado con política por taller en las tablas nuevas', () => {
  const tablas = lista(/FOREACH t IN ARRAY ARRAY\[([^\]]+)\] LOOP/)
  assert.deepEqual(tablas.sort(), ['albaran_lineas', 'albaranes'])
  assert.match(CODIGO, /ENABLE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /FORCE ROW LEVEL SECURITY/)
  assert.match(CODIGO, /USING \(taller_id = taller\.taller_actual\(\)\) WITH CHECK \(taller_id = taller\.taller_actual\(\)\)/)
})

test('0011: el outbox admite el hecho de compra', () => {
  assert.deepEqual(lista(/hechos_pendientes_tipo_chk CHECK \(tipo IN \(([^)]+)\)\)/), ['venta', 'cobro', 'compra', 'no_soportado'])
})

test('0011: los pedidos y artículos no se borran; un pedido enviado no cambia de contenido', () => {
  assert.match(CODIGO, /REVOKE DELETE ON taller\.articulos FROM prisma_taller;/)
  assert.match(CODIGO, /REVOKE DELETE ON taller\.pedidos FROM prisma_taller;/)
  assert.match(CODIGO, /un pedido enviado no cambia de contenido/)
})

test('0011 ↔ Prisma: cada columna nueva está en el schema', () => {
  for (const campo of ['pvpCent', 'margenPuntosBasicos', 'costeUnitarioCent', 'stockResultante', 'cantidadRecibida', 'numeroProveedor', 'facturaProveedorNumero']) {
    assert.match(PRISMA, new RegExp(`\\b${campo}\\b`), campo)
  }
  for (const m of ['Articulo', 'MovimientoStock', 'Pedido', 'PedidoLinea', 'Albaran', 'AlbaranLinea']) assert.match(PRISMA, new RegExp(`model ${m} \\{`), m)
  assert.match(PRISMA, /@@map\("albaran_lineas"\)/)
})
