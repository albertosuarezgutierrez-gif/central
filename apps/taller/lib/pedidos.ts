/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Pedidos a proveedor y albaranes de entrada (F2). Dentro de `conTaller` (RLS).
//
// NADA SALE A NADIE: el pedido se imprime o se copia (`textoPedido`) y el dueño lo manda por su cuenta (teléfono, correo, WhatsApp
// personal); la app solo deja constancia de QUE lo marcó como enviado (`marcarPedidoEnviado`: quién y cuándo). Aquí no hay
// ningún envío de correo ni de HTTP (lo vigila test/pedidos.test.ts).
//
// Albarán = entrada de mercancía: sube el stock, recalcula el coste medio ponderado y avanza el pedido (parcial/recibido). Puede
// entrar SIN precio (queda «sin valorar») y valorarse luego con la factura del proveedor (`valorarAlbaran`), que además encola el hecho
// contable de compra en el outbox (solo el puerto). Un mismo albarán (proveedor + número) no entra dos veces.
import {
  costeMedioPonderado, costeMedioTrasValorar, esUnidadStock, estadoTrasRecepcion, formatearCantidad, pendienteDeRecibir,
  type EstadoPedido, type UnidadStock,
} from '@central/module-taller'
import { encolarCompra, type TxOutbox } from './hechos-outbox.ts'
import { apuntarMovimiento, candadoStock, type TxStock } from './stock.ts'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a?: any): Promise<any>
  create(a: any): Promise<any>
  update(a: any): Promise<any>
}
export type TxPedidos = TxStock & TxOutbox & {
  proveedor: Delegado
  pedido: Delegado
  pedidoLinea: Delegado
  albaran: Delegado
  albaranLinea: Delegado
  vehiculo: Delegado
}
export type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string }
const num = (v: unknown): number | null => (v == null ? null : Number(v))
const cadena = (s: string | null | undefined) => (s ?? '').trim()

// ─── Pedido ──────────────────────────────────────────────────────────────────
export interface LineaPedidoNueva {
  articuloId?: string | null
  descripcion?: string
  referencia?: string | null
  cantidad: number
  unidad?: string
  costeUnitarioCent?: number | null
  otLineaId?: string | null
}

/** Crea un pedido en BORRADOR. La matrícula se toma de la OT si la hay (las compras se imputan al coche). */
export async function crearPedido(
  tx: TxPedidos, o: { tallerId: string; proveedorId: string; otId?: string | null; notas?: string | null; lineas: LineaPedidoNueva[] },
): Promise<Resultado<{ pedidoId: string }>> {
  const prov = await tx.proveedor.findFirst({ where: { tallerId: o.tallerId, id: o.proveedorId } })
  if (!prov || prov.activo === false) return { ok: false, motivo: 'Proveedor no encontrado' }
  if (o.lineas.length === 0) return { ok: false, motivo: 'El pedido no tiene líneas' }
  let matricula: string | null = null
  if (o.otId) {
    const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: o.tallerId, id: o.otId } })
    if (!ot) return { ok: false, motivo: 'Orden no encontrada' }
    matricula = (await tx.vehiculo.findFirst({ where: { tallerId: o.tallerId, id: ot.vehiculoId } }))?.matricula ?? null
  }
  const filas: any[] = []
  for (const l of o.lineas) {
    if (!Number.isSafeInteger(l.cantidad) || l.cantidad <= 0) return { ok: false, motivo: 'Cantidad no válida' }
    if (l.costeUnitarioCent != null && (!Number.isSafeInteger(l.costeUnitarioCent) || l.costeUnitarioCent < 0)) return { ok: false, motivo: 'Coste no válido' }
    let descripcion = cadena(l.descripcion), unidad = l.unidad ?? 'ud', referencia = cadena(l.referencia) || null
    if (l.articuloId) {
      const a = await tx.articulo.findFirst({ where: { tallerId: o.tallerId, id: l.articuloId } })
      if (!a) return { ok: false, motivo: 'Artículo no encontrado' }
      descripcion = descripcion || a.descripcion
      unidad = a.unidad
      referencia = referencia ?? a.referenciaFabricante ?? a.referencia ?? null
    }
    if (!descripcion) return { ok: false, motivo: 'Una línea no tiene descripción' }
    if (!esUnidadStock(unidad)) return { ok: false, motivo: 'Unidad no válida' }
    filas.push({
      tallerId: o.tallerId, articuloId: l.articuloId ?? null, otLineaId: l.otLineaId ?? null, descripcion, referencia, cantidad: l.cantidad, unidad,
      cantidadRecibida: 0, costeUnitarioCent: l.costeUnitarioCent == null ? null : BigInt(l.costeUnitarioCent),
    })
  }
  const p = await tx.pedido.create({ data: { tallerId: o.tallerId, otId: o.otId ?? null, proveedorId: o.proveedorId, matricula, estado: 'borrador', notas: cadena(o.notas) || null } })
  for (const f of filas) await tx.pedidoLinea.create({ data: { ...f, pedidoId: p.id } })
  return { ok: true, pedidoId: p.id }
}

/** El dueño dice «ya lo he enviado» (a mano). La app NO envía nada: solo anota quién y cuándo. */
export async function marcarPedidoEnviado(tx: TxPedidos, o: { tallerId: string; pedidoId: string; usuarioId: string; ahora: Date }): Promise<Resultado<object>> {
  const p = await tx.pedido.findFirst({ where: { tallerId: o.tallerId, id: o.pedidoId } })
  if (!p) return { ok: false, motivo: 'Pedido no encontrado' }
  if (p.estado !== 'borrador') return { ok: false, motivo: `El pedido ya está «${p.estado}»` }
  const n = (await tx.pedidoLinea.findMany({ where: { tallerId: o.tallerId, pedidoId: p.id } })).length
  if (n === 0) return { ok: false, motivo: 'El pedido no tiene líneas' }
  await tx.pedido.update({ where: { id: p.id }, data: { estado: 'enviado', enviadoPor: o.usuarioId, enviadoEn: o.ahora } })
  return { ok: true }
}

/** Cancela un pedido sin nada recibido. */
export async function cancelarPedido(tx: TxPedidos, o: { tallerId: string; pedidoId: string; ahora: Date }): Promise<Resultado<object>> {
  const p = await tx.pedido.findFirst({ where: { tallerId: o.tallerId, id: o.pedidoId } })
  if (!p) return { ok: false, motivo: 'Pedido no encontrado' }
  if (!['borrador', 'enviado'].includes(p.estado)) return { ok: false, motivo: `Un pedido «${p.estado}» ya no se cancela` }
  await tx.pedido.update({ where: { id: p.id }, data: { estado: 'cancelado', canceladoEn: o.ahora } })
  return { ok: true }
}

/** Texto del pedido para IMPRIMIR o COPIAR (el dueño lo manda él). Puro. */
export function textoPedido(
  p: { id: string; matricula: string | null; notas: string | null }, proveedor: { nombre: string }, taller: { nombreComercial: string },
  lineas: readonly { descripcion: string; referencia: string | null; cantidad: number; unidad: string }[], fecha: Date,
): string {
  const d = fecha.toISOString().slice(0, 10).split('-').reverse().join('/')
  const filas = lineas.map((l) => `- ${formatearCantidad(l.cantidad, (esUnidadStock(l.unidad) ? l.unidad : 'ud') as UnidadStock)}${l.unidad === 'ud' ? ' ud' : ''} · ${l.descripcion}${l.referencia ? ` (ref. ${l.referencia})` : ''}`)
  return [
    `PEDIDO ${p.id.slice(0, 8).toUpperCase()} · ${taller.nombreComercial} → ${proveedor.nombre}`,
    `Fecha: ${d}${p.matricula ? ` · Vehículo: ${p.matricula}` : ''}`,
    '', ...filas, ...(p.notas ? ['', p.notas] : []),
  ].join('\n')
}

// ─── Albarán de entrada ──────────────────────────────────────────────────────
export interface LineaAlbaranNueva {
  pedidoLineaId?: string | null
  articuloId?: string | null
  descripcion?: string
  cantidad: number
  /** Céntimos por ud o por litro. null/ausente = sin valorar todavía. */
  costeUnitarioCent?: number | null
}
export interface AvisoAlbaran { tipo: 'exceso' | 'sin_valorar' | 'sin_stock'; texto: string }

export async function registrarAlbaran(
  tx: TxPedidos,
  o: { tallerId: string; usuarioId: string | null; proveedorId: string; pedidoId?: string | null; numeroProveedor: string; fecha: string; notas?: string | null; lineas: LineaAlbaranNueva[] },
): Promise<Resultado<{ albaranId: string; avisos: AvisoAlbaran[] }>> {
  const numero = cadena(o.numeroProveedor)
  if (!numero) return { ok: false, motivo: 'Falta el número de albarán del proveedor' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.fecha) || Number.isNaN(Date.parse(o.fecha))) return { ok: false, motivo: 'Fecha no válida' }
  if (o.lineas.length === 0) return { ok: false, motivo: 'El albarán no tiene líneas' }
  await candadoStock(tx, o.tallerId)
  const prov = await tx.proveedor.findFirst({ where: { tallerId: o.tallerId, id: o.proveedorId } })
  if (!prov) return { ok: false, motivo: 'Proveedor no encontrado' }
  if (await tx.albaran.findFirst({ where: { tallerId: o.tallerId, proveedorId: o.proveedorId, numeroProveedor: numero } })) {
    return { ok: false, motivo: `El albarán ${numero} de ${prov.nombre} ya está registrado` }
  }
  let pedido: any = null
  if (o.pedidoId) {
    pedido = await tx.pedido.findFirst({ where: { tallerId: o.tallerId, id: o.pedidoId } })
    if (!pedido) return { ok: false, motivo: 'Pedido no encontrado' }
    if (pedido.proveedorId !== o.proveedorId) return { ok: false, motivo: 'El pedido es de otro proveedor' }
    if (!['enviado', 'parcial'].includes(pedido.estado)) return { ok: false, motivo: `El pedido está «${pedido.estado}»: solo se recibe lo enviado` }
  }
  // Validación completa ANTES de escribir.
  const previstas: { l: LineaAlbaranNueva; articulo: any; pl: any; unidad: UnidadStock; coste: number | null; descripcion: string }[] = []
  // UN objeto por artículo en todo el albarán: dos líneas del mismo artículo deben ver el stock y el coste que dejó la anterior.
  const articulos = new Map<string, any>()
  const articuloDe = async (id: string) => {
    if (!articulos.has(id)) articulos.set(id, await tx.articulo.findFirst({ where: { tallerId: o.tallerId, id } }))
    return articulos.get(id)
  }
  for (const l of o.lineas) {
    if (!Number.isSafeInteger(l.cantidad) || l.cantidad <= 0) return { ok: false, motivo: 'Cantidad no válida' }
    const coste = l.costeUnitarioCent == null ? null : l.costeUnitarioCent
    if (coste != null && (!Number.isSafeInteger(coste) || coste < 0)) return { ok: false, motivo: 'Coste no válido' }
    const pl = l.pedidoLineaId ? await tx.pedidoLinea.findFirst({ where: { tallerId: o.tallerId, id: l.pedidoLineaId } }) : null
    if (l.pedidoLineaId && (!pl || !pedido || pl.pedidoId !== pedido.id)) return { ok: false, motivo: 'La línea no es de ese pedido' }
    const articuloId = l.articuloId ?? pl?.articuloId ?? null
    const articulo = articuloId ? await articuloDe(articuloId) : null
    if (articuloId && !articulo) return { ok: false, motivo: 'Artículo no encontrado' }
    const descripcion = cadena(l.descripcion) || pl?.descripcion || articulo?.descripcion || ''
    if (!descripcion) return { ok: false, motivo: 'Una línea no tiene descripción' }
    const unidad = (articulo?.unidad ?? pl?.unidad ?? 'ud') as UnidadStock
    if (pl && articulo && pl.unidad !== articulo.unidad) return { ok: false, motivo: 'La unidad del pedido no coincide con la del artículo' }
    previstas.push({ l, articulo, pl, unidad, coste, descripcion })
  }

  const alb = await tx.albaran.create({
    data: { tallerId: o.tallerId, proveedorId: o.proveedorId, pedidoId: pedido?.id ?? null, numeroProveedor: numero, fecha: new Date(`${o.fecha}T00:00:00.000Z`), estado: 'recibido', creadoPor: o.usuarioId, notas: cadena(o.notas) || null },
  })
  const avisos: AvisoAlbaran[] = []
  const recibidas = new Map<string, number>()
  for (const p of previstas) {
    const a = p.articulo
    const linea = await tx.albaranLinea.create({
      data: {
        tallerId: o.tallerId, albaranId: alb.id, pedidoLineaId: p.pl?.id ?? null, articuloId: a?.id ?? null, descripcion: p.descripcion, cantidad: p.l.cantidad,
        unidad: p.unidad, costeUnitarioCent: p.coste == null ? null : BigInt(p.coste), ivaPuntosBasicos: a?.ivaCodigo ? await puntosDeIva(tx, o.tallerId, a.ivaCodigo) : null,
      },
    })
    if (p.pl) {
      const total = (recibidas.get(p.pl.id) ?? Number(p.pl.cantidadRecibida)) + p.l.cantidad
      recibidas.set(p.pl.id, total)
      await tx.pedidoLinea.update({ where: { id: p.pl.id }, data: { cantidadRecibida: total } })
      if (total > Number(p.pl.cantidad)) avisos.push({ tipo: 'exceso', texto: `«${p.descripcion}»: llegan más de lo pedido (${formatearCantidad(total, p.unidad)} de ${formatearCantidad(Number(p.pl.cantidad), p.unidad)})` })
    }
    if (!a) continue
    const stockAntes = num(a.stock)
    const medioAntes = num(a.costeMedioCent)
    if (p.coste == null) avisos.push({ tipo: 'sin_valorar', texto: `«${p.descripcion}» entra sin precio: el coste medio no cambia hasta valorar el albarán` })
    const nuevoMedio = p.coste == null ? medioAntes : stockAntes == null ? p.coste : costeMedioPonderado({ stock: stockAntes, costeMedioCent: medioAntes, entrada: p.l.cantidad, costeEntradaCent: p.coste })
    const mov = await apuntarMovimiento(tx, {
      tallerId: o.tallerId, articulo: a, delta: p.l.cantidad, motivo: 'entrada_albaran', usuarioId: o.usuarioId, costeUnitarioCent: p.coste, albaranLineaId: linea.id,
    })
    if (!mov.llevaStock) avisos.push({ tipo: 'sin_stock', texto: `«${p.descripcion}» no se lleva a stock: solo se actualiza su coste` })
    if (nuevoMedio !== medioAntes) {
      await tx.articulo.update({ where: { id: a.id }, data: { costeMedioCent: nuevoMedio == null ? null : BigInt(nuevoMedio) } })
      a.costeMedioCent = nuevoMedio == null ? null : BigInt(nuevoMedio)
    }
  }
  if (pedido) {
    const ls = await tx.pedidoLinea.findMany({ where: { tallerId: o.tallerId, pedidoId: pedido.id } })
    const nuevo: EstadoPedido = estadoTrasRecepcion(pedido.estado, ls.map((l) => ({ cantidad: Number(l.cantidad), recibida: Number(l.cantidadRecibida) })))
    if (nuevo !== pedido.estado) await tx.pedido.update({ where: { id: pedido.id }, data: { estado: nuevo, ...(nuevo === 'recibido' ? { recibidoEn: new Date(`${o.fecha}T00:00:00.000Z`) } : {}) } })
  }
  return { ok: true, albaranId: alb.id, avisos }
}

async function puntosDeIva(tx: Pick<TxStock, 'tipoIva'>, tallerId: string, codigo: string): Promise<number | null> {
  const i = await tx.tipoIva.findFirst({ where: { tallerId, codigo, activo: true } })
  return i ? Number(i.puntosBasicos) : null
}

/** Cuánto falta por recibir de un pedido (para la pantalla). */
export async function pendienteDePedido(tx: Pick<TxPedidos, 'pedidoLinea'>, tallerId: string, pedidoId: string) {
  const ls = await tx.pedidoLinea.findMany({ where: { tallerId, pedidoId } })
  return ls.map((l) => ({ id: l.id as string, descripcion: l.descripcion as string, unidad: l.unidad as string, pendiente: pendienteDeRecibir({ cantidad: Number(l.cantidad), recibida: Number(l.cantidadRecibida) }) }))
}

// ─── Valorar con la factura del proveedor ────────────────────────────────────
export interface ValoracionLinea { lineaId: string; costeUnitarioCent: number; ivaPuntosBasicos?: number | null }

/**
 * Pone coste a las líneas sin valorar con la factura del proveedor, ajusta el coste medio de lo que aún queda en almacén y encola el
 * hecho de COMPRA en el outbox (el cron lo envía; aquí no hay HTTP). Todas las líneas deben quedar valoradas.
 */
export async function valorarAlbaran(
  tx: TxPedidos,
  o: { tallerId: string; albaranId: string; facturaNumero: string; facturaFecha: string; costes: ValoracionLinea[]; ahora: Date },
): Promise<Resultado<object>> {
  const facturaNumero = cadena(o.facturaNumero)
  if (!facturaNumero) return { ok: false, motivo: 'Falta el número de la factura del proveedor' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.facturaFecha) || Number.isNaN(Date.parse(o.facturaFecha))) return { ok: false, motivo: 'Fecha de factura no válida' }
  await candadoStock(tx, o.tallerId)
  const alb = await tx.albaran.findFirst({ where: { tallerId: o.tallerId, id: o.albaranId } })
  if (!alb) return { ok: false, motivo: 'Albarán no encontrado' }
  if (alb.estado === 'valorado') return { ok: false, motivo: 'El albarán ya está valorado' }
  const lineas = await tx.albaranLinea.findMany({ where: { tallerId: o.tallerId, albaranId: alb.id } })
  const porId = new Map(o.costes.map((c) => [c.lineaId, c]))
  for (const l of lineas) {
    const c = porId.get(l.id)
    if (l.costeUnitarioCent == null && !c) return { ok: false, motivo: `Falta el precio de «${l.descripcion}»` }
    if (c && (!Number.isSafeInteger(c.costeUnitarioCent) || c.costeUnitarioCent < 0)) return { ok: false, motivo: 'Precio no válido' }
  }
  for (const l of lineas) {
    if (l.costeUnitarioCent != null) continue
    const c = porId.get(l.id)!
    const iva = c.ivaPuntosBasicos ?? num(l.ivaPuntosBasicos)
    await tx.albaranLinea.update({ where: { id: l.id }, data: { costeUnitarioCent: BigInt(c.costeUnitarioCent), ivaPuntosBasicos: iva } })
    l.costeUnitarioCent = BigInt(c.costeUnitarioCent)
    l.ivaPuntosBasicos = iva
    if (l.articuloId) {
      const a = await tx.articulo.findFirst({ where: { tallerId: o.tallerId, id: l.articuloId } })
      if (a) {
        const medio = costeMedioTrasValorar({ stock: num(a.stock), costeMedioCent: num(a.costeMedioCent), entrada: Number(l.cantidad), costeEntradaCent: c.costeUnitarioCent })
        await tx.articulo.update({ where: { id: a.id }, data: { costeMedioCent: BigInt(medio) } })
      }
    }
  }
  await tx.albaran.update({ where: { id: alb.id }, data: { estado: 'valorado', facturaProveedorNumero: facturaNumero, facturaProveedorFecha: new Date(`${o.facturaFecha}T00:00:00.000Z`), valoradoEn: o.ahora } })
  const prov = await tx.proveedor.findFirst({ where: { tallerId: o.tallerId, id: alb.proveedorId } })
  const ped = alb.pedidoId ? await tx.pedido.findFirst({ where: { tallerId: o.tallerId, id: alb.pedidoId } }) : null
  await encolarCompra(tx, {
    tallerId: o.tallerId,
    albaran: {
      albaranId: alb.id, proveedorNombre: prov?.nombre ?? 'proveedor', numeroAlbaran: alb.numeroProveedor, facturaNumero, facturaFecha: o.facturaFecha,
      matricula: ped?.matricula ?? null,
      lineas: lineas.map((l) => ({ cantidad: Number(l.cantidad), unidad: l.unidad as UnidadStock, costeUnitarioCent: num(l.costeUnitarioCent), ivaPuntosBasicos: num(l.ivaPuntosBasicos) })),
    },
  })
  if (ped && ped.estado === 'recibido') {
    const otros = (await tx.albaran.findMany({ where: { tallerId: o.tallerId, pedidoId: ped.id } })).filter((x) => x.id !== alb.id && x.estado !== 'valorado')
    if (otros.length === 0) await tx.pedido.update({ where: { id: ped.id }, data: { estado: 'facturado' } })
  }
  return { ok: true }
}
