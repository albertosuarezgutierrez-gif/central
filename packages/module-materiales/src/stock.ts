// Lógica de stock del módulo Materiales. Funciones puras sobre tipos genéricos (sin BD).
import type {
  Material, AsignacionMaterial, ResumenStock, ResumenContable,
  Movimiento, UnidadMaterial, Kit, KitItem,
  InventarioFisicoLinea, ReservaAnticipada,
} from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Disponible tras reservar `cantidad` unidades (no baja de 0). */
export function disponibilidadTrasReserva(disponible: number, cantidad: number): number {
  return Math.max(0, disponible - cantidad)
}

/** Disponible tras devolver `cantidad` unidades (no supera el total). */
export function disponibilidadTrasDevolucion(disponible: number, total: number, cantidad: number): number {
  return Math.min(total, disponible + cantidad)
}

/** Coste de los daños = unidades dañadas × coste de reposición. */
export function costeDanos(cantidadDanada: number, costeReposicion: number): number {
  return round2(cantidadDanada * costeReposicion)
}

/** Valor del stock = Σ cantidadTotal × costeReposicion. */
export function valorStock(materiales: Material[]): number {
  return round2(materiales.reduce((s, m) => s + m.cantidadTotal * m.costeReposicion, 0))
}

/** Resumen agregado del catálogo (cantidades + valor de reposición). */
export function resumenStock(materiales: Material[]): ResumenStock {
  const unidadesTotales = materiales.reduce((s, m) => s + m.cantidadTotal, 0)
  const unidadesDisponibles = materiales.reduce((s, m) => s + m.cantidadDisponible, 0)
  return {
    materiales: materiales.length,
    unidadesTotales,
    unidadesDisponibles,
    unidadesComprometidas: unidadesTotales - unidadesDisponibles,
    valorTotal: valorStock(materiales),
  }
}

/** Gasto total de compra = Σ cantidadTotal × precioCompra. */
export function gastoCompras(materiales: Material[]): number {
  return round2(materiales.reduce((s, m) => s + m.cantidadTotal * m.precioCompra, 0))
}

/** Resumen contable: gasto en compras, gasto en roturas, valor de inventario disponible. */
export function resumenContable(materiales: Material[], asignaciones: AsignacionMaterial[]): ResumenContable {
  const gastoRoturas = round2(asignaciones.reduce((s, a) => s + (a.costeDanos ?? 0), 0))
  const valorInventario = round2(materiales.reduce((s, m) => s + m.cantidadDisponible * m.costeReposicion, 0))
  return {
    gastoCompras: gastoCompras(materiales),
    gastoRoturas,
    valorInventario,
    totalMateriales: materiales.length,
    totalActivos: materiales.filter(m => m.tipo === 'activo').length,
    totalConsumibles: materiales.filter(m => m.tipo === 'consumible').length,
  }
}

/** True si el material puede transferirse (operativo/deteriorado, activo, disponibles suficientes). */
export function puedeTransferir(material: Material, cantidad: number): boolean {
  if (!material.activo) return false
  if (material.estado === 'en_reparacion' || material.estado === 'baja') return false
  return material.cantidadDisponible >= cantidad
}

/** Materiales cuya cantidad disponible está por debajo del stockMinimo definido. */
export function alertasStockMinimo(materiales: Material[]): Material[] {
  return materiales.filter(m => m.stockMinimo != null && m.cantidadDisponible < m.stockMinimo)
}

// ── Ledger functions ──────────────────────────────────────────

/**
 * Stock actual calculado desde el ledger (no desde snapshot).
 * entrada: +total +disponible | salida: -disponible | devolucion: +disponible
 * rotura: -total -disponible | ajuste: +total +disponible | transferencia: sin efecto
 */
export function stockActualDesdeLedger(movimientos: Movimiento[]): { total: number; disponible: number } {
  let total = 0
  let disponible = 0
  for (const m of movimientos) {
    switch (m.tipo) {
      case 'entrada':      total += m.cantidad; disponible += m.cantidad; break
      case 'salida':       disponible -= m.cantidad; break
      case 'devolucion':   disponible += m.cantidad; break
      case 'rotura':       total -= m.cantidad; disponible -= m.cantidad; break
      case 'ajuste':       total += m.cantidad; disponible += m.cantidad; break
      case 'transferencia': break
    }
  }
  return { total: Math.max(0, total), disponible: Math.max(0, disponible) }
}

/** Unidades ubicadas en un espacio concreto derivado del historial de transferencias. */
export function stockPorEspacio(movimientos: Movimiento[], espacioId: string): number {
  let count = 0
  for (const m of movimientos) {
    switch (m.tipo) {
      case 'transferencia':
        if (m.espacioOrigenId === espacioId) count -= m.cantidad
        if (m.espacioDestinoId === espacioId) count += m.cantidad
        break
      case 'entrada':
        if (m.espacioDestinoId === espacioId) count += m.cantidad
        break
      case 'salida':
        if (m.espacioOrigenId === espacioId) count -= m.cantidad
        break
      case 'devolucion':
        if (m.espacioDestinoId === espacioId) count += m.cantidad
        break
      case 'rotura':
        if (m.espacioOrigenId === espacioId) count -= m.cantidad
        break
      case 'ajuste':
        if (m.espacioDestinoId === espacioId) count += m.cantidad
        break
    }
  }
  return Math.max(0, count)
}

/** Unidades disponibles en una fecha futura, descontando reservas confirmadas que solapan esa fecha. */
export function disponibilidadEnFecha(
  movimientos: Movimiento[],
  reservas: ReservaAnticipada[],
  fecha: string
): number {
  const prevMov = movimientos.filter(m => m.fecha <= fecha)
  const { disponible } = stockActualDesdeLedger(prevMov)
  const reservadas = reservas
    .filter(r => r.estado === 'confirmada' && r.fechaDesde <= fecha && r.fechaHasta >= fecha)
    .reduce((s, r) => s + r.cantidad, 0)
  return Math.max(0, disponible - reservadas)
}

/** Expande un kit × cantidad en stubs de movimientos individuales (sin id). */
export function expandirKit(
  _kit: Kit,
  items: KitItem[],
  cantidad: number,
  base: Omit<Movimiento, 'id' | 'materialId' | 'cantidad'>
): Omit<Movimiento, 'id'>[] {
  return items.map(item => ({
    ...base,
    materialId: item.materialId,
    cantidad: item.cantidad * cantidad,
  }))
}

/** Valor depreciado de una unidad (lineal). Devuelve 0 cuando está totalmente amortizada. */
export function calcularDepreciacion(
  precioCompra: number,
  fechaCompra: string,
  vidaUtilAnios: number,
  fechaRef?: string
): number {
  if (vidaUtilAnios <= 0 || precioCompra <= 0) return 0
  const ref = new Date(fechaRef ?? new Date().toISOString().slice(0, 10))
  const compra = new Date(fechaCompra)
  const aniosTranscurridos = (ref.getTime() - compra.getTime()) / (365.25 * 24 * 3600 * 1000)
  const fraccion = Math.min(1, Math.max(0, aniosTranscurridos / vidaUtilAnios))
  return round2(precioCompra * (1 - fraccion))
}

/** Alertas activas: stock bajo mínimo y garantía próxima a vencer. */
export function alertasVencimiento(
  materiales: Material[],
  unidades: UnidadMaterial[],
  diasAnticipacion = 30
): { tipo: 'garantia' | 'stock_minimo'; materialId: string; mensaje: string }[] {
  const alertas: { tipo: 'garantia' | 'stock_minimo'; materialId: string; mensaje: string }[] = []
  const limite = new Date(Date.now() + diasAnticipacion * 24 * 3600 * 1000)

  for (const m of materiales) {
    if (m.stockMinimo != null && m.cantidadDisponible < m.stockMinimo) {
      alertas.push({
        tipo: 'stock_minimo',
        materialId: m.id,
        mensaje: `${m.nombre}: ${m.cantidadDisponible} disponibles (mín. ${m.stockMinimo})`,
      })
    }
  }

  for (const u of unidades) {
    if (u.garantiaHasta && u.activo) {
      const expiry = new Date(u.garantiaHasta)
      if (expiry <= limite) {
        alertas.push({
          tipo: 'garantia',
          materialId: u.materialId,
          mensaje: `Unidad ${u.codigoQr}: garantía expira ${u.garantiaHasta}`,
        })
      }
    }
  }

  return alertas
}

/**
 * Deltas de ajuste tras un inventario físico.
 * delta > 0 → crear movimiento 'ajuste' (más de lo esperado)
 * delta < 0 → crear movimiento 'rotura' con abs(delta) (menos de lo esperado)
 */
export function ajusteInventario(
  lineas: InventarioFisicoLinea[]
): { materialId: string; delta: number }[] {
  return lineas
    .filter(l => l.cantidadContada !== l.cantidadSistema)
    .map(l => ({ materialId: l.materialId, delta: l.cantidadContada - l.cantidadSistema }))
}
