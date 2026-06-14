// Tests de lógica pura del módulo de materiales.
// Runner: node --test (Node 22, type-stripping nativo).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  round2,
  disponibilidadTrasReserva,
  disponibilidadTrasDevolucion,
  costeDanos,
  valorStock,
  resumenStock,
  gastoCompras,
  resumenContable,
  puedeTransferir,
  alertasStockMinimo,
  stockActualDesdeLedger,
  stockPorEspacio,
  disponibilidadEnFecha,
  expandirKit,
  calcularDepreciacion,
  alertasVencimiento,
  ajusteInventario,
} from '../src/stock.ts'
import type {
  Material, AsignacionMaterial,
  Movimiento, UnidadMaterial, Kit, KitItem,
  InventarioFisicoLinea, ReservaAnticipada,
} from '../src/types.ts'

// ── Helpers ──────────────────────────────────────────────────────────────────

function mat(over: Partial<Material> = {}): Material {
  return {
    id: '1',
    negocioId: 'n1',
    nombre: 'Sofá',
    categoria: 'mobiliario',
    tipo: 'activo',
    estado: 'operativo',
    cantidadTotal: 10,
    cantidadDisponible: 8,
    precioCompra: 300,
    costeReposicion: 350,
    activo: true,
    ...over,
  }
}

function asig(over: Partial<AsignacionMaterial> = {}): AsignacionMaterial {
  return {
    id: 'a1',
    materialId: '1',
    cantidadReservada: 2,
    estado: 'entregado',
    ...over,
  }
}

// ── round2 ───────────────────────────────────────────────────────────────────

test('round2: redondea a 2 decimales', () => {
  assert.equal(round2(1.005), 1.01)
  assert.equal(round2(1.004), 1)
  assert.equal(round2(0), 0)
})

// ── disponibilidad ────────────────────────────────────────────────────────────

test('disponibilidadTrasReserva: no baja de 0', () => {
  assert.equal(disponibilidadTrasReserva(2, 5), 0)
  assert.equal(disponibilidadTrasReserva(8, 3), 5)
})

test('disponibilidadTrasDevolucion: no supera el total', () => {
  assert.equal(disponibilidadTrasDevolucion(8, 10, 5), 10)
  assert.equal(disponibilidadTrasDevolucion(5, 10, 3), 8)
})

// ── costeDanos ────────────────────────────────────────────────────────────────

test('costeDanos: cantidad × costeReposicion redondeado', () => {
  assert.equal(costeDanos(2, 350), 700)
  assert.equal(costeDanos(1, 12.333), 12.33)
})

// ── valorStock ────────────────────────────────────────────────────────────────

test('valorStock: suma cantidadTotal × costeReposicion', () => {
  const mats = [mat({ cantidadTotal: 2, costeReposicion: 100 }), mat({ cantidadTotal: 3, costeReposicion: 50 })]
  assert.equal(valorStock(mats), 350)
})

test('valorStock: lista vacía = 0', () => {
  assert.equal(valorStock([]), 0)
})

// ── resumenStock ──────────────────────────────────────────────────────────────

test('resumenStock: agrega correctamente', () => {
  const mats = [
    mat({ cantidadTotal: 10, cantidadDisponible: 8, costeReposicion: 100 }),
    mat({ id: '2', cantidadTotal: 5, cantidadDisponible: 5, costeReposicion: 200 }),
  ]
  const r = resumenStock(mats)
  assert.equal(r.materiales, 2)
  assert.equal(r.unidadesTotales, 15)
  assert.equal(r.unidadesDisponibles, 13)
  assert.equal(r.unidadesComprometidas, 2)
  assert.equal(r.valorTotal, 2000)
})

// ── gastoCompras ──────────────────────────────────────────────────────────────

test('gastoCompras: suma cantidadTotal × precioCompra', () => {
  const mats = [
    mat({ cantidadTotal: 2, precioCompra: 300 }),
    mat({ id: '2', cantidadTotal: 5, precioCompra: 10 }),
  ]
  assert.equal(gastoCompras(mats), 650)
})

test('gastoCompras: lista vacía = 0', () => {
  assert.equal(gastoCompras([]), 0)
})

// ── resumenContable ───────────────────────────────────────────────────────────

test('resumenContable: acumula compras + roturas correctamente', () => {
  const mats = [
    mat({ tipo: 'activo', cantidadTotal: 2, precioCompra: 300, costeReposicion: 350, cantidadDisponible: 2 }),
    mat({ id: '2', tipo: 'consumible', cantidadTotal: 5, precioCompra: 10, costeReposicion: 12, cantidadDisponible: 3 }),
  ]
  const asigs = [
    asig({ costeDanos: 700 }),
    asig({ id: 'a2', materialId: '2', costeDanos: null }),
  ]
  const r = resumenContable(mats, asigs)
  assert.equal(r.gastoCompras, 650)
  assert.equal(r.gastoRoturas, 700)
  assert.equal(r.valorInventario, round2(2 * 350 + 3 * 12))
  assert.equal(r.totalMateriales, 2)
  assert.equal(r.totalActivos, 1)
  assert.equal(r.totalConsumibles, 1)
})

// ── puedeTransferir ───────────────────────────────────────────────────────────

test('puedeTransferir: true si hay disponibles y estado ok', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 3, estado: 'operativo' }), 2), true)
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 3, estado: 'deteriorado' }), 3), true)
})

test('puedeTransferir: false si no hay suficientes', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 1 }), 2), false)
})

test('puedeTransferir: false si estado en_reparacion o baja', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 5, estado: 'en_reparacion' }), 1), false)
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 5, estado: 'baja' }), 1), false)
})

test('puedeTransferir: false si no activo', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 5, activo: false }), 1), false)
})

// ── alertasStockMinimo ────────────────────────────────────────────────────────

test('alertasStockMinimo: solo los que están por debajo del mínimo', () => {
  const mats = [
    mat({ id: '1', cantidadDisponible: 2, stockMinimo: 5 }),
    mat({ id: '2', cantidadDisponible: 10, stockMinimo: 5 }),
    mat({ id: '3', cantidadDisponible: 5, stockMinimo: 5 }),
    mat({ id: '4', cantidadDisponible: 1, stockMinimo: null }),
  ]
  const alertas = alertasStockMinimo(mats)
  assert.equal(alertas.length, 1)
  assert.equal(alertas[0].id, '1')
})

// ── Helpers ledger ────────────────────────────────────────────

function mov(over: Partial<Movimiento> = {}): Movimiento {
  return { id: 'm1', negocioId: 'n1', materialId: '1', tipo: 'entrada', cantidad: 10, fecha: '2026-01-01', ...over }
}

function unidad(over: Partial<UnidadMaterial> = {}): UnidadMaterial {
  return { id: 'u1', negocioId: 'n1', materialId: '1', codigoQr: 'QR-001', estado: 'operativo', activo: true, ...over }
}

// ── stockActualDesdeLedger ────────────────────────────────────

test('stockActualDesdeLedger: entrada añade total y disponible', () => {
  const r = stockActualDesdeLedger([mov({ tipo: 'entrada', cantidad: 10 })])
  assert.equal(r.total, 10)
  assert.equal(r.disponible, 10)
})

test('stockActualDesdeLedger: salida reduce disponible', () => {
  const r = stockActualDesdeLedger([
    mov({ tipo: 'entrada', cantidad: 10 }),
    mov({ id: 'm2', tipo: 'salida', cantidad: 3 }),
  ])
  assert.equal(r.total, 10)
  assert.equal(r.disponible, 7)
})

test('stockActualDesdeLedger: devolucion repone disponible', () => {
  const r = stockActualDesdeLedger([
    mov({ tipo: 'entrada', cantidad: 10 }),
    mov({ id: 'm2', tipo: 'salida', cantidad: 3 }),
    mov({ id: 'm3', tipo: 'devolucion', cantidad: 2 }),
  ])
  assert.equal(r.disponible, 9)
})

test('stockActualDesdeLedger: rotura reduce total y disponible', () => {
  const r = stockActualDesdeLedger([
    mov({ tipo: 'entrada', cantidad: 10 }),
    mov({ id: 'm2', tipo: 'rotura', cantidad: 2 }),
  ])
  assert.equal(r.total, 8)
  assert.equal(r.disponible, 8)
})

test('stockActualDesdeLedger: transferencia no afecta totales', () => {
  const r = stockActualDesdeLedger([
    mov({ tipo: 'entrada', cantidad: 10 }),
    mov({ id: 'm2', tipo: 'transferencia', cantidad: 4, espacioOrigenId: 'e1', espacioDestinoId: 'e2' }),
  ])
  assert.equal(r.total, 10)
  assert.equal(r.disponible, 10)
})

test('stockActualDesdeLedger: no baja de 0', () => {
  const r = stockActualDesdeLedger([mov({ tipo: 'salida', cantidad: 5 })])
  assert.equal(r.total, 0)
  assert.equal(r.disponible, 0)
})

// ── stockPorEspacio ───────────────────────────────────────────

test('stockPorEspacio: entrada a destino suma', () => {
  const movs = [mov({ tipo: 'entrada', cantidad: 10, espacioDestinoId: 'e1' })]
  assert.equal(stockPorEspacio(movs, 'e1'), 10)
})

test('stockPorEspacio: transferencia mueve entre espacios', () => {
  const movs = [
    mov({ tipo: 'entrada', cantidad: 10, espacioDestinoId: 'e1' }),
    mov({ id: 'm2', tipo: 'transferencia', cantidad: 4, espacioOrigenId: 'e1', espacioDestinoId: 'e2' }),
  ]
  assert.equal(stockPorEspacio(movs, 'e1'), 6)
  assert.equal(stockPorEspacio(movs, 'e2'), 4)
})

test('stockPorEspacio: espacio desconocido = 0', () => {
  assert.equal(stockPorEspacio([], 'e99'), 0)
})

// ── disponibilidadEnFecha ─────────────────────────────────────

test('disponibilidadEnFecha: sin reservas devuelve stock actual', () => {
  const movs = [mov({ tipo: 'entrada', cantidad: 10, fecha: '2026-01-01' })]
  assert.equal(disponibilidadEnFecha(movs, [], '2026-06-01'), 10)
})

test('disponibilidadEnFecha: descuenta reserva activa en la fecha', () => {
  const movs = [mov({ tipo: 'entrada', cantidad: 10, fecha: '2026-01-01' })]
  const reservas: ReservaAnticipada[] = [{
    id: 'r1', negocioId: 'n1', materialId: '1',
    cantidad: 3, fechaDesde: '2026-06-01', fechaHasta: '2026-06-05', estado: 'confirmada',
  }]
  assert.equal(disponibilidadEnFecha(movs, reservas, '2026-06-03'), 7)
})

test('disponibilidadEnFecha: ignora reserva fuera de rango', () => {
  const movs = [mov({ tipo: 'entrada', cantidad: 10, fecha: '2026-01-01' })]
  const reservas: ReservaAnticipada[] = [{
    id: 'r1', negocioId: 'n1', materialId: '1',
    cantidad: 3, fechaDesde: '2026-07-01', fechaHasta: '2026-07-05', estado: 'confirmada',
  }]
  assert.equal(disponibilidadEnFecha(movs, reservas, '2026-06-03'), 10)
})

// ── expandirKit ───────────────────────────────────────────────

test('expandirKit: genera movimiento por item multiplicado por cantidad', () => {
  const kit: Kit = { id: 'k1', negocioId: 'n1', nombre: 'Mesa completa', activo: true }
  const items: KitItem[] = [
    { id: 'ki1', kitId: 'k1', materialId: 'm1', cantidad: 4 },
    { id: 'ki2', kitId: 'k1', materialId: 'm2', cantidad: 1 },
  ]
  const base: Omit<Movimiento, 'id' | 'materialId' | 'cantidad'> = { negocioId: 'n1', tipo: 'salida', fecha: '2026-06-12' }
  const result = expandirKit(kit, items, 2, base)
  assert.equal(result.length, 2)
  assert.equal(result[0].materialId, 'm1')
  assert.equal(result[0].cantidad, 8)
  assert.equal(result[1].materialId, 'm2')
  assert.equal(result[1].cantidad, 2)
})

// ── calcularDepreciacion ──────────────────────────────────────

test('calcularDepreciacion: sin depreciar si recién comprado', () => {
  const hoy = new Date().toISOString().slice(0, 10)
  assert.equal(calcularDepreciacion(1000, hoy, 5), 1000)
})

test('calcularDepreciacion: totalmente depreciado tras vida útil', () => {
  assert.equal(calcularDepreciacion(1000, '2010-01-01', 5, '2016-01-01'), 0)
})

test('calcularDepreciacion: mitad a mitad de vida útil (±5 € por años bisiestos)', () => {
  const valor = calcularDepreciacion(1000, '2020-01-01', 10, '2025-01-01')
  assert.ok(Math.abs(valor - 500) < 5, `Expected ~500 but got ${valor}`)
})

test('calcularDepreciacion: vidaUtil=0 devuelve 0', () => {
  assert.equal(calcularDepreciacion(1000, '2020-01-01', 0), 0)
})

// ── alertasVencimiento ────────────────────────────────────────

test('alertasVencimiento: detecta stock por debajo de mínimo', () => {
  const mats = [mat({ id: '1', cantidadDisponible: 2, stockMinimo: 5 })]
  const alertas = alertasVencimiento(mats, [])
  assert.equal(alertas.length, 1)
  assert.equal(alertas[0].tipo, 'stock_minimo')
  assert.equal(alertas[0].materialId, '1')
})

test('alertasVencimiento: detecta garantía próxima a vencer', () => {
  const manana = new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const alertas = alertasVencimiento([], [unidad({ garantiaHasta: manana })])
  assert.equal(alertas.length, 1)
  assert.equal(alertas[0].tipo, 'garantia')
})

test('alertasVencimiento: ignora garantía lejana', () => {
  const lejano = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const alertas = alertasVencimiento([], [unidad({ garantiaHasta: lejano })], 30)
  assert.equal(alertas.length, 0)
})

// ── ajusteInventario ──────────────────────────────────────────

test('ajusteInventario: retorna delta para líneas con diferencia', () => {
  const lineas: InventarioFisicoLinea[] = [
    { id: 'l1', inventarioId: 'i1', materialId: 'm1', cantidadSistema: 10, cantidadContada: 12, diferencia: 2, ajusteGenerado: false },
    { id: 'l2', inventarioId: 'i1', materialId: 'm2', cantidadSistema: 5, cantidadContada: 5, diferencia: 0, ajusteGenerado: false },
    { id: 'l3', inventarioId: 'i1', materialId: 'm3', cantidadSistema: 8, cantidadContada: 6, diferencia: -2, ajusteGenerado: false },
  ]
  const result = ajusteInventario(lineas)
  assert.equal(result.length, 2)
  assert.equal(result[0].materialId, 'm1')
  assert.equal(result[0].delta, 2)
  assert.equal(result[1].materialId, 'm3')
  assert.equal(result[1].delta, -2)
})

test('ajusteInventario: lista vacía si todo cuadra', () => {
  const lineas: InventarioFisicoLinea[] = [
    { id: 'l1', inventarioId: 'i1', materialId: 'm1', cantidadSistema: 10, cantidadContada: 10, diferencia: 0, ajusteGenerado: false },
  ]
  assert.equal(ajusteInventario(lineas).length, 0)
})
