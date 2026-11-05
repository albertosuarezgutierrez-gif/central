// Stock, coste medio ponderado, granel en litros y pedidos: lógica PURA.
// Cepos vistos FALLAR (05/11/2026), uno por aserción, y restaurados:
// (1) en costeMedioPonderado sumar `stock * costeMedioCent` sin ponderar (usar la media simple) → rojo «coste medio ponderado».
// (2) en parsearCantidad permitir 4 decimales de litro → rojo «litros: máx. 3 decimales».
// (3) en aplicarMovimiento devolver `negativo: false` siempre → rojo «stock negativo se señala».
// (4) en movimientoDeCierre quitar el `if (delta === 0) return null` → rojo «cerrar dos veces no apunta nada».
// (5) en estadoTrasRecepcion devolver 'recibido' si alguna línea está recibida → rojo «pedido parcial».
// (6) en avisosDeStock tratar `minimo == null` como 0 → rojo «sin mínimo no se avisa».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarMovimiento, avisosDeStock, costeMedioPonderado, costeMedioTrasValorar, descontadoPorOt, estadoTrasRecepcion, formatearCantidad,
  importeStockCent, lineaRecambio, movimientoDeCierre, parsearCantidad, pendienteDeRecibir, precioVentaUnitario,
} from '../src/index.ts'

test('coste medio ponderado (no media simple) y casos sin existencias o sin coste previo', () => {
  assert.equal(costeMedioPonderado({ stock: 10, costeMedioCent: 100, entrada: 10, costeEntradaCent: 200 }), 150)
  assert.equal(costeMedioPonderado({ stock: 20, costeMedioCent: 150, entrada: 5, costeEntradaCent: 250 }), 170)
  // 3 uds a 100 + 1 ud a 200 = 125 (la media simple daría 150)
  assert.equal(costeMedioPonderado({ stock: 3, costeMedioCent: 100, entrada: 1, costeEntradaCent: 200 }), 125)
  assert.equal(costeMedioPonderado({ stock: 0, costeMedioCent: 999, entrada: 4, costeEntradaCent: 50 }), 50, 'sin existencias manda la entrada')
  assert.equal(costeMedioPonderado({ stock: null, costeMedioCent: null, entrada: 4, costeEntradaCent: 50 }), 50)
  assert.equal(costeMedioPonderado({ stock: 5, costeMedioCent: null, entrada: 5, costeEntradaCent: 80 }), 80, 'stock sin coste conocido: no se inventa')
  assert.equal(costeMedioPonderado({ stock: -3, costeMedioCent: 100, entrada: 2, costeEntradaCent: 70 }), 70, 'stock negativo no resta valor')
  assert.equal(costeMedioPonderado({ stock: 1, costeMedioCent: 100, entrada: 2, costeEntradaCent: 101 }), 101, 'redondeo al céntimo (100+202)/3=100,67')
  assert.throws(() => costeMedioPonderado({ stock: 1, costeMedioCent: 1, entrada: 0, costeEntradaCent: 1 }))
})

test('valoración tardía: solo cambian las unidades de la entrada que aún quedan', () => {
  // stock 10 (a 100), entran 4 sin precio (ya dentro del stock 10) y la factura dice 200: 6·100 + 4·200 = 1400/10
  assert.equal(costeMedioTrasValorar({ stock: 10, costeMedioCent: 100, entrada: 4, costeEntradaCent: 200 }), 140)
  // ya se gastó casi todo: quedan 2 de las 4 → solo esas 2 se revalorizan
  assert.equal(costeMedioTrasValorar({ stock: 2, costeMedioCent: 100, entrada: 4, costeEntradaCent: 200 }), 200)
  assert.equal(costeMedioTrasValorar({ stock: 0, costeMedioCent: 100, entrada: 4, costeEntradaCent: 200 }), 200)
})

test('granel: litros con decimales en milésimas, sin floats', () => {
  assert.equal(parsearCantidad('2,5', 'ml'), 2500)
  assert.equal(parsearCantidad('0.75', 'ml'), 750)
  assert.equal(parsearCantidad('1,234', 'ml'), 1234)
  assert.equal(parsearCantidad('3', 'ml'), 3000)
  assert.equal(parsearCantidad('1,2345', 'ml'), null, 'litros: máx. 3 decimales')
  assert.equal(parsearCantidad('2,5', 'ud'), null, 'unidades: solo enteros')
  assert.equal(parsearCantidad('-1', 'ud'), null)
  assert.equal(parsearCantidad('-1,5', 'ml', { permitirNegativo: true }), -1500)
  assert.equal(parsearCantidad('abc', 'ud'), null)
  assert.equal(formatearCantidad(2500, 'ml'), '2,5 L')
  assert.equal(formatearCantidad(750, 'ml'), '0,75 L')
  assert.equal(formatearCantidad(1234, 'ml'), '1,234 L')
  assert.equal(formatearCantidad(3000, 'ml'), '3 L')
  assert.equal(formatearCantidad(-500, 'ml'), '-0,5 L')
  assert.equal(formatearCantidad(7, 'ud'), '7')
  // 1,25 L a 9,00 €/L = 11,25 €
  assert.equal(importeStockCent(1250, 900, 'ml'), 1125)
  assert.equal(importeStockCent(3, 250, 'ud'), 750)
  // redondeo único: 0,333 L a 1,00 €/L = 33,3 → 33 céntimos
  assert.equal(importeStockCent(333, 100, 'ml'), 33)
})

test('precio de venta: PVP, o coste + margen, o nada (nunca 0)', () => {
  assert.deepEqual(precioVentaUnitario({ pvpCent: 1500, costeMedioCent: 1000, margenPuntosBasicos: 5000 }), { cent: 1500, origen: 'pvp' })
  assert.deepEqual(precioVentaUnitario({ pvpCent: null, costeMedioCent: 1000, margenPuntosBasicos: 3500 }), { cent: 1350, origen: 'margen' })
  assert.equal(precioVentaUnitario({ pvpCent: null, costeMedioCent: null, margenPuntosBasicos: 3500 }), null)
  assert.equal(precioVentaUnitario({ pvpCent: null, costeMedioCent: 1000, margenPuntosBasicos: null }), null)
})

test('línea de recambio: venta, IVA y COSTE real al coste medio del momento', () => {
  const l = lineaRecambio({ cantidad: 2, unidad: 'ud', precioUnitCent: 1500, costeMedioCent: 900, ivaPuntosBasicos: 2100 })
  assert.deepEqual(l, { baseCent: 3000, cuotaIvaCent: 630, totalCent: 3630, costeCent: 1800 })
  const g = lineaRecambio({ cantidad: 1250, unidad: 'ml', precioUnitCent: 900, costeMedioCent: 400, ivaPuntosBasicos: 2100 })
  assert.deepEqual([g.baseCent, g.costeCent], [1125, 500])
  assert.equal(lineaRecambio({ cantidad: 1, unidad: 'ud', precioUnitCent: 100, costeMedioCent: null, ivaPuntosBasicos: 2100 }).costeCent, null, 'sin coste conocido: null, no 0')
  assert.equal(lineaRecambio({ cantidad: 1, unidad: 'ud', precioUnitCent: 100, costeMedioCent: 0, ivaPuntosBasicos: 2100 }).costeCent, 0, 'coste 0 declarado sí es un dato')
})

test('stock negativo se señala; el artículo que no se lleva a stock no genera movimiento', () => {
  assert.deepEqual(aplicarMovimiento(3, -5), { lleva: true, stockNuevo: -2, negativo: true })
  assert.deepEqual(aplicarMovimiento(5, -5), { lleva: true, stockNuevo: 0, negativo: false })
  assert.deepEqual(aplicarMovimiento(0, 4), { lleva: true, stockNuevo: 4, negativo: false })
  assert.deepEqual(aplicarMovimiento(null, -5), { lleva: false })
  assert.throws(() => aplicarMovimiento(1, 0))
})

test('cerrar la OT: idempotente, suma lo añadido y devuelve lo quitado', () => {
  assert.deepEqual(movimientoDeCierre(5, 0), { motivo: 'consumo_ot', cantidad: -5 })
  assert.equal(movimientoDeCierre(5, 5), null, 'cerrar dos veces no apunta nada')
  assert.deepEqual(movimientoDeCierre(7, 5), { motivo: 'consumo_ot_extra', cantidad: -2 })
  assert.deepEqual(movimientoDeCierre(3, 5), { motivo: 'devolucion_ot', cantidad: 2 })
  assert.deepEqual(movimientoDeCierre(0, 5), { motivo: 'devolucion_ot', cantidad: 5 })
  assert.equal(movimientoDeCierre(0, 0), null)
  assert.equal(descontadoPorOt([{ motivo: 'consumo_ot', cantidad: -5 }, { motivo: 'consumo_ot_extra', cantidad: -2 }, { motivo: 'devolucion_ot', cantidad: 3 }, { motivo: 'entrada_albaran', cantidad: 50 }]), 4)
})

test('pedido parcial: estado según lo recibido; borrador/facturado/cancelado no se tocan', () => {
  const l = (cantidad: number, recibida: number) => ({ cantidad, recibida })
  assert.equal(estadoTrasRecepcion('enviado', [l(10, 0), l(4, 0)]), 'enviado')
  assert.equal(estadoTrasRecepcion('enviado', [l(10, 6), l(4, 0)]), 'parcial')
  assert.equal(estadoTrasRecepcion('parcial', [l(10, 10), l(4, 3)]), 'parcial')
  assert.equal(estadoTrasRecepcion('parcial', [l(10, 10), l(4, 4)]), 'recibido')
  assert.equal(estadoTrasRecepcion('enviado', [l(10, 12)]), 'recibido', 'llegar de más también completa')
  assert.equal(estadoTrasRecepcion('borrador', [l(10, 10)]), 'borrador')
  assert.equal(estadoTrasRecepcion('facturado', [l(10, 10)]), 'facturado')
  assert.equal(estadoTrasRecepcion('cancelado', [l(10, 10)]), 'cancelado')
  assert.equal(pendienteDeRecibir(l(10, 6)), 4)
  assert.equal(pendienteDeRecibir(l(10, 12)), 0)
})

test('avisos de stock: negativo, agotado y bajo mínimo; sin mínimo no se avisa; no llevado a stock no cuenta', () => {
  const a = (id: string, stock: number | null, minimo: number | null, extra = {}) => ({ id, descripcion: id, unidad: 'ud' as const, stock, minimo, ...extra })
  const r = avisosDeStock([a('b', 2, 5), a('c', 0, 3), a('d', -1, null), a('e', 100, 5), a('f', 0, null), a('g', null, 5), a('h', 1, 5, { activo: false })])
  assert.deepEqual(r.map((x) => [x.articuloId, x.tipo]), [['d', 'negativo'], ['c', 'agotado'], ['b', 'bajo_minimo']])
  assert.equal(avisosDeStock([a('x', 0, null)]).length, 0, 'sin mínimo no se avisa (null = no se sabe)')
})
