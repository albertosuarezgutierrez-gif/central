// Stock, coste medio ponderado y pedidos del taller (F2). PURO: sin BD. Spec 2026-11-04-taller-global2.md §3 y §4.5-4.6.
//
// UNIDADES: las cantidades son ENTEROS en la unidad base: `ud` (unidades) o `ml` (granel: milésimas de litro, así 2,5 L = 2500 ml
// y no hay decimales flotantes). El COSTE y el PRECIO unitarios se expresan en céntimos por `ud` o por LITRO (1000 ml).
// Regla del CLAUDE.md raíz: «dato que NO hay ≠ 0». Coste/precio/stock/mínimo `null` = no se sabe / no se lleva; nunca 0 por defecto.
import { cuotaIvaCent, importeGranelCent } from './presupuesto.ts'
import { dividirRedondeando } from './dinero.ts'

export const UNIDADES_STOCK = ['ud', 'ml'] as const
export type UnidadStock = (typeof UNIDADES_STOCK)[number]
export const esUnidadStock = (x: unknown): x is UnidadStock => typeof x === 'string' && (UNIDADES_STOCK as readonly string[]).includes(x)

/** Tipos de movimiento (espejo del CHECK de 0011). Signo de `cantidad`: entradas +, salidas −, ajuste ±. */
export const MOTIVOS_MOVIMIENTO = ['entrada_albaran', 'consumo_ot', 'consumo_ot_extra', 'devolucion_ot', 'ajuste_inventario'] as const
export type MotivoMovimiento = (typeof MOTIVOS_MOVIMIENTO)[number]

/** Importe en céntimos de `cantidad` (ud o ml) a `centPorUnidad` (céntimos por ud o por litro). Un solo redondeo. */
export function importeStockCent(cantidad: number, centPorUnidad: number, unidad: UnidadStock): number {
  if (!Number.isSafeInteger(cantidad) || !Number.isSafeInteger(centPorUnidad)) throw new RangeError('importeStockCent: enteros')
  return unidad === 'ml' ? importeGranelCent(cantidad, centPorUnidad) : cantidad * centPorUnidad
}

/**
 * Coste medio ponderado tras una entrada: (stock·medio + entrada·coste) / (stock + entrada), redondeado al céntimo.
 * Vale igual en `ud` que en `ml` (el divisor de litros se cancela). Casos: sin existencias (stock null/≤0) o sin coste previo
 * (medio null) → el coste de la entrada; stock negativo no resta valor (se trata como 0 existencias).
 */
export function costeMedioPonderado(o: { stock: number | null; costeMedioCent: number | null; entrada: number; costeEntradaCent: number }): number {
  if (!Number.isSafeInteger(o.entrada) || o.entrada <= 0) throw new RangeError('la entrada debe ser > 0')
  if (!Number.isSafeInteger(o.costeEntradaCent) || o.costeEntradaCent < 0) throw new RangeError('coste de entrada inválido')
  const stock = o.stock != null && o.stock > 0 ? o.stock : 0
  if (stock === 0 || o.costeMedioCent == null) return o.costeEntradaCent
  return dividirRedondeando(stock * o.costeMedioCent + o.entrada * o.costeEntradaCent, stock + o.entrada)
}

/**
 * Valoración TARDÍA: la entrada llegó sin coste (albarán sin precio) y ahora se conoce con la factura. Solo las unidades de esa
 * entrada que AÚN quedan (min(entrada, stock)) cambian de valor; el resto del stock conserva su coste medio.
 */
export function costeMedioTrasValorar(o: { stock: number | null; costeMedioCent: number | null; entrada: number; costeEntradaCent: number }): number {
  const stock = o.stock != null && o.stock > 0 ? o.stock : 0
  if (stock === 0 || o.costeMedioCent == null) return o.costeEntradaCent
  const q = Math.min(o.entrada, stock)
  return dividirRedondeando((stock - q) * o.costeMedioCent + q * o.costeEntradaCent, stock)
}

export type PrecioVenta = { cent: number; origen: 'pvp' | 'margen' }
/** Precio de venta unitario: el PVP fijado; si no, coste medio + margen por defecto (puntos básicos sobre coste); si no, null. */
export function precioVentaUnitario(o: { pvpCent: number | null; costeMedioCent: number | null; margenPuntosBasicos: number | null }): PrecioVenta | null {
  if (o.pvpCent != null) return { cent: o.pvpCent, origen: 'pvp' }
  if (o.costeMedioCent != null && o.margenPuntosBasicos != null) {
    return { cent: dividirRedondeando(o.costeMedioCent * (10_000 + o.margenPuntosBasicos), 10_000), origen: 'margen' }
  }
  return null
}

export interface LineaRecambio { baseCent: number; cuotaIvaCent: number; totalCent: number; costeCent: number | null }
/** Línea de OT a partir del catálogo: venta al precio unitario y COSTE = coste medio en este momento (null si no se conoce). */
export function lineaRecambio(o: { cantidad: number; unidad: UnidadStock; precioUnitCent: number; costeMedioCent: number | null; ivaPuntosBasicos: number }): LineaRecambio {
  const baseCent = importeStockCent(o.cantidad, o.precioUnitCent, o.unidad)
  const cuota = cuotaIvaCent(baseCent, o.ivaPuntosBasicos)
  return {
    baseCent, cuotaIvaCent: cuota, totalCent: baseCent + cuota,
    costeCent: o.costeMedioCent == null ? null : importeStockCent(o.cantidad, o.costeMedioCent, o.unidad),
  }
}

/** Aplica un movimiento. `stock` null = el artículo no se lleva a stock: no hay movimiento. Negativo = hay que AVISAR. */
export function aplicarMovimiento(stock: number | null, delta: number): { lleva: false } | { lleva: true; stockNuevo: number; negativo: boolean } {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new RangeError('movimiento: delta entero ≠ 0')
  if (stock == null) return { lleva: false }
  const stockNuevo = stock + delta
  return { lleva: true, stockNuevo, negativo: stockNuevo < 0 }
}

/**
 * Qué movimiento hay que apuntar al cerrar una OT para un artículo: `necesario` = suma de sus líneas; `yaDescontado` = lo ya
 * sacado por esta OT (consumos − devoluciones). Idempotente: cerrar dos veces sin cambios no apunta nada. Reabrir y quitar una
 * línea devuelve; añadir más saca más. `null` = nada que hacer.
 */
export function movimientoDeCierre(necesario: number, yaDescontado: number): { motivo: MotivoMovimiento; cantidad: number } | null {
  if (!Number.isSafeInteger(necesario) || necesario < 0 || !Number.isSafeInteger(yaDescontado) || yaDescontado < 0) throw new RangeError('movimientoDeCierre: enteros ≥ 0')
  const delta = necesario - yaDescontado
  if (delta === 0) return null
  if (delta > 0) return { motivo: yaDescontado === 0 ? 'consumo_ot' : 'consumo_ot_extra', cantidad: -delta }
  return { motivo: 'devolucion_ot', cantidad: -delta }
}
/** Lo ya descontado por una OT a partir de sus movimientos (consumos restan stock → cantidad negativa). */
export const descontadoPorOt = (movs: readonly { motivo: string; cantidad: number }[]): number =>
  -movs.filter((m) => m.motivo === 'consumo_ot' || m.motivo === 'consumo_ot_extra' || m.motivo === 'devolucion_ot').reduce((s, m) => s + m.cantidad, 0)

// ─── Pedidos y albaranes ─────────────────────────────────────────────────────
/** Estados del pedido. `enviado` = marcado como enviado A MANO por el dueño (la app no envía nada a nadie). */
export const ESTADOS_PEDIDO = ['borrador', 'enviado', 'parcial', 'recibido', 'facturado', 'cancelado'] as const
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number]
export const esEstadoPedido = (x: unknown): x is EstadoPedido => typeof x === 'string' && (ESTADOS_PEDIDO as readonly string[]).includes(x)

/** Estado tras recibir: nada recibido → igual; todo (≥ pedido) → recibido; algo → parcial. Facturado/cancelado no se tocan. */
export function estadoTrasRecepcion(actual: EstadoPedido, lineas: readonly { cantidad: number; recibida: number }[]): EstadoPedido {
  if (actual === 'facturado' || actual === 'cancelado' || actual === 'borrador') return actual
  if (lineas.length === 0 || lineas.every((l) => l.recibida <= 0)) return actual
  return lineas.every((l) => l.recibida >= l.cantidad) ? 'recibido' : 'parcial'
}
/** Lo que falta por recibir de una línea (nunca negativo). */
export const pendienteDeRecibir = (l: { cantidad: number; recibida: number }): number => Math.max(0, l.cantidad - l.recibida)

// ─── Avisos de stock ─────────────────────────────────────────────────────────
export type TipoAvisoStock = 'negativo' | 'agotado' | 'bajo_minimo'
export interface AvisoStock { articuloId: string; descripcion: string; tipo: TipoAvisoStock; stock: number; minimo: number | null; unidad: UnidadStock }
const ORDEN_AVISO: Record<TipoAvisoStock, number> = { negativo: 0, agotado: 1, bajo_minimo: 2 }

/**
 * Avisos del inicio del dueño. Solo artículos que se LLEVAN a stock (`stock` ≠ null). Negativo (siempre, haya o no mínimo): el
 * inventario no cuadra con la realidad. Agotado/bajo mínimo: solo si hay mínimo fijado (null = «no se sabe», no se avisa).
 */
export function avisosDeStock(articulos: readonly { id: string; descripcion: string; unidad: UnidadStock; stock: number | null; minimo: number | null; activo?: boolean }[]): AvisoStock[] {
  const out: AvisoStock[] = []
  for (const a of articulos) {
    if (a.stock == null || a.activo === false) continue
    const base = { articuloId: a.id, descripcion: a.descripcion, stock: a.stock, minimo: a.minimo, unidad: a.unidad }
    if (a.stock < 0) out.push({ ...base, tipo: 'negativo' })
    else if (a.minimo != null && a.stock === 0) out.push({ ...base, tipo: 'agotado' })
    else if (a.minimo != null && a.stock < a.minimo) out.push({ ...base, tipo: 'bajo_minimo' })
  }
  return out.sort((x, y) => ORDEN_AVISO[x.tipo] - ORDEN_AVISO[y.tipo] || x.descripcion.localeCompare(y.descripcion, 'es'))
}

// ─── Cantidades en pantalla ──────────────────────────────────────────────────
/** `ud` → «3»; `ml` → litros en español con hasta 3 decimales: 2500 → «2,5 L», 750 → «0,75 L». */
export function formatearCantidad(cantidad: number, unidad: UnidadStock): string {
  if (!Number.isSafeInteger(cantidad)) throw new RangeError('formatearCantidad: entero')
  if (unidad === 'ud') return String(cantidad)
  const neg = cantidad < 0
  const a = Math.abs(cantidad)
  const ent = Math.floor(a / 1000)
  const dec = String(a % 1000).padStart(3, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${ent}${dec ? ',' + dec : ''} L`
}
/** Texto del usuario → cantidad entera en unidad base. `ud`: entero; `ml`: LITROS con coma o punto y ≤ 3 decimales. null si no vale. */
export function parsearCantidad(texto: string, unidad: UnidadStock, opciones: { permitirNegativo?: boolean } = {}): number | null {
  const t = texto.trim().replace(',', '.')
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(t)
  if (!m) return null
  const neg = m[1] === '-'
  if (neg && !opciones.permitirNegativo) return null
  let v: number
  if (unidad === 'ud') {
    if (m[3] !== undefined) return null
    v = Number(m[2])
  } else {
    if ((m[3]?.length ?? 0) > 3) return null
    v = Number(m[2]) * 1000 + Number((m[3] ?? '').padEnd(3, '0') || 0)
  }
  return Number.isSafeInteger(v) ? (neg ? -v : v) : null
}
