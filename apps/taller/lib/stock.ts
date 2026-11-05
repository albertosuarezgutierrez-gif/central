/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Artículos y almacén del taller (F2). Todo dentro de `conTaller` (RLS). Cantidades en unidad base (ud / ml), dinero en céntimos.
//
// DECISIÓN — cuándo sale el stock: AL CERRAR LA OT (paso a «terminado»), no al facturar. Motivos: (1) el material ya está gastado en
// el coche cuando el mecánico termina; (2) decisión de Alberto (04/11): un coche terminado puede entregarse sin factura, así que
// atar la salida a la factura dejaría existencias fantasma; (3) coincide con el granel de la spec (§4.5: «al cerrar la OT»). La
// salida es IDEMPOTENTE: reabrir y volver a cerrar solo apunta la diferencia (`movimientoDeCierre`). Solo cuentan líneas ACEPTADAS.
//
// STOCK NEGATIVO: no se bloquea el cierre del coche (el inventario de un taller recién abierto casi nunca cuadra), pero NUNCA en
// silencio: la salida devuelve `avisos` (se enseñan al cerrar) y el inicio del dueño lista los artículos con stock < 0 mientras lo estén.
//
// Los movimientos son SOLO-AÑADIR: aquí jamás se llama a update/delete de `movimientoStock` (lo vigila test/stock.test.ts).
import {
  aplicarMovimiento, descontadoPorOt, esUnidadStock, lineaRecambio, movimientoDeCierre, precioVentaUnitario, avisosDeStock,
  type AvisoStock, type MotivoMovimiento, type UnidadStock,
} from '@central/module-taller'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a?: any): Promise<any>
  create(a: any): Promise<any>
  update(a: any): Promise<any>
}
export type TxStock = {
  $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<unknown>
  articulo: Delegado
  movimientoStock: { findMany(a?: any): Promise<any[]>; create(a: any): Promise<any> }
  otLinea: Delegado
  ordenTrabajo: Delegado
  tipoIva: Delegado
  ivaPorDefecto: Delegado
}

export type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string }
const num = (v: unknown): number | null => (v == null ? null : Number(v))

/** Serializa los movimientos de stock del taller (lectura-modificación-escritura del stock y del coste medio). */
export async function candadoStock(tx: Pick<TxStock, '$executeRaw'>, tallerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'stock:' + tallerId}))`
}

// ─── Artículos ───────────────────────────────────────────────────────────────
export interface DatosArticulo {
  referencia: string | null
  referenciaFabricante: string | null
  descripcion: string
  marca: string | null
  unidad: string
  minimo: number | null
  pvpCent: number | null
  margenPuntosBasicos: number | null
  ivaCodigo: string | null
  mlPorEnvase: number | null
}
const t = (s: string | null | undefined) => (s ?? '').trim() || null
const entOpt = (v: number | null, nombre: string, min = 0): string | null =>
  v == null || (Number.isSafeInteger(v) && v >= min) ? null : `${nombre} no válido`

function validar(d: DatosArticulo): string | null {
  if (!t(d.descripcion)) return 'Falta la descripción'
  if (!esUnidadStock(d.unidad)) return 'Unidad no válida (ud o litros)'
  return entOpt(d.minimo, 'El stock mínimo') ?? entOpt(d.pvpCent, 'El PVP') ?? entOpt(d.margenPuntosBasicos, 'El margen') ?? entOpt(d.mlPorEnvase, 'El envase', 1)
}
const datos = (d: DatosArticulo) => ({
  referencia: t(d.referencia), referenciaFabricante: t(d.referenciaFabricante), descripcion: d.descripcion.trim(), marca: t(d.marca), unidad: d.unidad,
  minimo: d.minimo, pvpCent: d.pvpCent == null ? null : BigInt(d.pvpCent), margenPuntosBasicos: d.margenPuntosBasicos, ivaCodigo: t(d.ivaCodigo), mlPorEnvase: d.mlPorEnvase,
})

async function referenciaLibre(tx: Pick<TxStock, 'articulo'>, tallerId: string, referencia: string | null, excepto?: string): Promise<boolean> {
  if (!referencia) return true
  const otro = await tx.articulo.findFirst({ where: { tallerId, referencia } })
  return !otro || otro.id === excepto
}

/** Alta de artículo. NO lleva stock hasta el primer inventario/entrada (stock null ≠ 0). */
export async function crearArticulo(tx: Pick<TxStock, 'articulo'>, o: { tallerId: string; datos: DatosArticulo }): Promise<Resultado<{ articuloId: string }>> {
  const err = validar(o.datos)
  if (err) return { ok: false, motivo: err }
  if (!(await referenciaLibre(tx, o.tallerId, t(o.datos.referencia)))) return { ok: false, motivo: 'Ya hay un artículo con esa referencia' }
  const a = await tx.articulo.create({ data: { tallerId: o.tallerId, ...datos(o.datos), stock: null, costeMedioCent: null, activo: true } })
  return { ok: true, articuloId: a.id }
}

/** Edita los datos del artículo. La unidad NO cambia si ya hay stock o coste (cambiaría el significado de las cantidades). */
export async function editarArticulo(tx: Pick<TxStock, 'articulo'>, o: { tallerId: string; articuloId: string; datos: DatosArticulo; activo?: boolean }): Promise<Resultado<object>> {
  const a = await tx.articulo.findFirst({ where: { tallerId: o.tallerId, id: o.articuloId } })
  if (!a) return { ok: false, motivo: 'Artículo no encontrado' }
  const err = validar(o.datos)
  if (err) return { ok: false, motivo: err }
  if (o.datos.unidad !== a.unidad && (a.stock != null || a.costeMedioCent != null)) return { ok: false, motivo: 'No se cambia la unidad de un artículo con stock o coste' }
  if (!(await referenciaLibre(tx, o.tallerId, t(o.datos.referencia), a.id))) return { ok: false, motivo: 'Ya hay un artículo con esa referencia' }
  await tx.articulo.update({ where: { id: a.id }, data: { ...datos(o.datos), ...(o.activo === undefined ? {} : { activo: o.activo }) } })
  return { ok: true }
}

// ─── Movimientos ─────────────────────────────────────────────────────────────
export interface MovimientoNuevo {
  tallerId: string; articulo: any; delta: number; motivo: MotivoMovimiento; usuarioId: string | null
  otId?: string | null; nota?: string | null; costeUnitarioCent?: number | null; albaranLineaId?: string | null
}
/**
 * Apunta UN movimiento y actualiza `articulo.stock`. El artículo que no se lleva a stock (stock null) no genera movimiento.
 * Devuelve el stock resultante y si quedó negativo (el llamante AVISA). Llamar con el candado de stock tomado.
 */
export async function apuntarMovimiento(tx: Pick<TxStock, 'articulo' | 'movimientoStock'>, m: MovimientoNuevo): Promise<{ llevaStock: false } | { llevaStock: true; stockNuevo: number; negativo: boolean }> {
  const r = aplicarMovimiento(num(m.articulo.stock), m.delta)
  if (!r.lleva) return { llevaStock: false }
  await tx.movimientoStock.create({
    data: {
      tallerId: m.tallerId, articuloId: m.articulo.id, otId: m.otId ?? null, cantidad: m.delta, motivo: m.motivo, nota: m.nota ?? null,
      costeUnitarioCent: m.costeUnitarioCent == null ? null : BigInt(m.costeUnitarioCent), stockResultante: r.stockNuevo,
      usuarioId: m.usuarioId, albaranLineaId: m.albaranLineaId ?? null,
    },
  })
  await tx.articulo.update({ where: { id: m.articulo.id }, data: { stock: r.stockNuevo } })
  m.articulo.stock = r.stockNuevo
  return { llevaStock: true, stockNuevo: r.stockNuevo, negativo: r.negativo }
}

/**
 * Ajuste de inventario con MOTIVO escrito: el usuario cuenta lo que hay (`contado`) y se apunta la diferencia. Si el artículo no se
 * llevaba a stock, el primer recuento lo empieza a llevar (stock = contado; sin movimiento si es 0, pues no hay nada que mover).
 */
export async function ajustarInventario(
  tx: TxStock, o: { tallerId: string; usuarioId: string | null; articuloId: string; contado: number; nota: string },
): Promise<Resultado<{ delta: number; stockNuevo: number }>> {
  const nota = o.nota.trim()
  if (!nota) return { ok: false, motivo: 'El ajuste de inventario necesita un motivo' }
  if (!Number.isSafeInteger(o.contado) || o.contado < 0) return { ok: false, motivo: 'El recuento no es válido' }
  await candadoStock(tx, o.tallerId)
  const a = await tx.articulo.findFirst({ where: { tallerId: o.tallerId, id: o.articuloId } })
  if (!a) return { ok: false, motivo: 'Artículo no encontrado' }
  const actual = num(a.stock)
  if (actual == null) {
    if (o.contado === 0) { await tx.articulo.update({ where: { id: a.id }, data: { stock: 0 } }); return { ok: true, delta: 0, stockNuevo: 0 } }
    await tx.articulo.update({ where: { id: a.id }, data: { stock: 0 } })
    a.stock = 0
  }
  const delta = o.contado - (actual ?? 0)
  if (delta === 0) return { ok: true, delta: 0, stockNuevo: o.contado }
  await apuntarMovimiento(tx, { tallerId: o.tallerId, articulo: a, delta, motivo: 'ajuste_inventario', usuarioId: o.usuarioId, nota })
  return { ok: true, delta, stockNuevo: o.contado }
}

// ─── Recambio del catálogo → línea de OT ─────────────────────────────────────
const OT_ABIERTAS = ['aceptado', 'en_curso', 'ampliacion_pendiente']

async function ivaDe(tx: Pick<TxStock, 'tipoIva' | 'ivaPorDefecto'>, tallerId: string, articulo: any, tipoLinea: string): Promise<{ codigo: string; puntosBasicos: number } | null> {
  let codigo: string | null = articulo.ivaCodigo ?? null
  if (!codigo) codigo = (await tx.ivaPorDefecto.findFirst({ where: { tallerId, tipoLinea } }))?.ivaCodigo ?? null
  if (!codigo) return null
  const iva = await tx.tipoIva.findFirst({ where: { tallerId, codigo, activo: true } })
  return iva ? { codigo, puntosBasicos: Number(iva.puntosBasicos) } : null
}

/**
 * Añade a la OT un recambio del catálogo: precio de venta = PVP (o coste medio + margen por defecto) y `coste_cent` = coste medio
 * EN ESTE MOMENTO (null si el artículo aún no tiene coste: el panel dirá «margen incompleto», nunca 0). `aceptadaEn` solo si el
 * cliente ya lo aceptó (presupuesto o conversación registrada): sin él la línea queda fuera de la factura. NO toca el stock (sale al cerrar).
 */
export async function anadirRecambioDesdeCatalogo(
  tx: TxStock, o: { tallerId: string; otId: string; articuloId: string; cantidad: number; aceptadaEn: Date | null },
): Promise<Resultado<{ lineaId: string; costeCent: number | null; avisoStock: string | null }>> {
  if (!Number.isSafeInteger(o.cantidad) || o.cantidad <= 0) return { ok: false, motivo: 'Cantidad no válida' }
  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: o.tallerId, id: o.otId } })
  if (!ot) return { ok: false, motivo: 'Orden no encontrada' }
  if (!OT_ABIERTAS.includes(ot.estado)) return { ok: false, motivo: `La orden está «${ot.estado}»: ya no admite recambios` }
  const a = await tx.articulo.findFirst({ where: { tallerId: o.tallerId, id: o.articuloId } })
  if (!a || a.activo === false) return { ok: false, motivo: 'Artículo no encontrado' }
  const unidad = a.unidad as UnidadStock
  const tipo = unidad === 'ml' ? 'granel' : 'pieza'
  const precio = precioVentaUnitario({ pvpCent: num(a.pvpCent), costeMedioCent: num(a.costeMedioCent), margenPuntosBasicos: num(a.margenPuntosBasicos) })
  if (!precio) return { ok: false, motivo: 'El artículo no tiene PVP ni coste con margen: fija el precio en Artículos' }
  const iva = await ivaDe(tx, o.tallerId, a, tipo)
  if (!iva) return { ok: false, motivo: 'Falta el IVA del artículo (ni propio ni por defecto en Ajustes)' }
  const l = lineaRecambio({ cantidad: o.cantidad, unidad, precioUnitCent: precio.cent, costeMedioCent: num(a.costeMedioCent), ivaPuntosBasicos: iva.puntosBasicos })
  const fila = await tx.otLinea.create({
    data: {
      tallerId: o.tallerId, otId: o.otId, tipo, descripcion: a.descripcion, cantidad: o.cantidad, unidad, baseCent: BigInt(l.baseCent),
      ivaCodigo: iva.codigo, ivaPuntosBasicos: iva.puntosBasicos, cuotaIvaCent: BigInt(l.cuotaIvaCent), totalCent: BigInt(l.totalCent),
      baremoMinutos: null, minutosReales: null, costeCent: l.costeCent == null ? null : BigInt(l.costeCent), articuloId: a.id,
      origen: 'manual', aceptadaEn: o.aceptadaEn,
    },
  })
  const stock = num(a.stock)
  const avisoStock = stock != null && stock < o.cantidad ? `Stock insuficiente de «${a.descripcion}»: hay ${stock} y se usan ${o.cantidad} (unidad base)` : null
  return { ok: true, lineaId: fila.id, costeCent: l.costeCent, avisoStock }
}

// ─── Salida de stock al cerrar la OT ─────────────────────────────────────────
export interface AvisoSalida { articuloId: string; descripcion: string; stockNuevo: number; unidad: UnidadStock }
/**
 * Descuenta del almacén lo consumido en la OT (líneas aceptadas con artículo). Idempotente: cerrar otra vez solo apunta la diferencia.
 * Devuelve los artículos que quedaron en NEGATIVO para que quien cierra lo vea.
 */
export async function salirStockOt(tx: TxStock, o: { tallerId: string; otId: string; usuarioId: string | null }): Promise<{ avisos: AvisoSalida[]; movimientos: number }> {
  const lineas = (await tx.otLinea.findMany({ where: { tallerId: o.tallerId, otId: o.otId } })).filter((l) => l.articuloId && l.aceptadaEn != null)
  const previos = await tx.movimientoStock.findMany({ where: { tallerId: o.tallerId, otId: o.otId } })
  // También los artículos que tuvieron salida y ya no tienen línea (se quitó): hay que devolverlos.
  const ids = new Set<string>([...lineas.map((l) => l.articuloId as string), ...previos.map((m) => m.articuloId as string)])
  if (ids.size === 0) return { avisos: [], movimientos: 0 }
  await candadoStock(tx, o.tallerId)
  const avisos: AvisoSalida[] = []
  let movimientos = 0
  for (const id of ids) {
    const necesario = lineas.filter((l) => l.articuloId === id).reduce((s, l) => s + Number(l.cantidad), 0)
    const ya = descontadoPorOt(previos.filter((m) => m.articuloId === id).map((m) => ({ motivo: m.motivo, cantidad: Number(m.cantidad) })))
    const mov = movimientoDeCierre(necesario, Math.max(0, ya))
    if (!mov) continue
    const a = await tx.articulo.findFirst({ where: { tallerId: o.tallerId, id } })
    if (!a) continue
    const r = await apuntarMovimiento(tx, { tallerId: o.tallerId, articulo: a, delta: mov.cantidad, motivo: mov.motivo, usuarioId: o.usuarioId, otId: o.otId })
    if (!r.llevaStock) continue
    movimientos++
    if (r.negativo) avisos.push({ articuloId: id, descripcion: a.descripcion, stockNuevo: r.stockNuevo, unidad: a.unidad })
  }
  return { avisos, movimientos }
}

// ─── Avisos de stock (inicio del dueño) ──────────────────────────────────────
export async function cargarAvisosStock(tx: Pick<TxStock, 'articulo'>, tallerId: string): Promise<AvisoStock[]> {
  const xs = await tx.articulo.findMany({ where: { tallerId, activo: true }, take: 5000 })
  return avisosDeStock(xs.map((a) => ({ id: a.id, descripcion: a.descripcion, unidad: a.unidad, stock: num(a.stock), minimo: num(a.minimo) })))
}
