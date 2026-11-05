'use server'
// Acciones de pedidos a proveedor. NADA se envía desde aquí: «Marcar como enviado» solo anota que el dueño lo mandó por su cuenta
// (el pedido se imprime o se copia). Cada acción: sesión → conPermiso (rol re-leído en BD) → lib/pedidos.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { parsearCantidad } from '@central/module-taller'
import { conPermiso, mensajeDeAcceso } from '@/lib/contexto'
import { cancelarPedido, crearPedido, marcarPedidoEnviado, type LineaPedidoNueva, type TxPedidos } from '@/lib/pedidos'

const Id = z.string().uuid()
const LINEAS = 6

function ir(ruta: string, msg: string | null, bueno = false): never {
  revalidatePath('/pedidos')
  redirect(msg ? `${ruta}?aviso=${encodeURIComponent(msg)}${bueno ? '&ok=1' : ''}` : ruta)
}
async function intentar(fn: () => Promise<{ ok: true } | { ok: false; motivo: string }>): Promise<string | null> {
  try {
    const r = await fn()
    return r.ok ? null : r.motivo
  } catch (e) {
    const m = mensajeDeAcceso(e)
    if (m) return m
    console.error('[pedidos]', e)
    return 'No se pudo completar. Inténtalo de nuevo'
  }
}

/** Nuevo pedido en BORRADOR: proveedor, OT opcional (de ahí sale la matrícula) y hasta 6 líneas (artículo del catálogo o texto libre). */
export async function crearPedidoAccion(fd: FormData): Promise<void> {
  const proveedorId = Id.safeParse(fd.get('proveedorId'))
  const otRaw = String(fd.get('otId') ?? '').trim()
  const otId = otRaw ? Id.safeParse(otRaw) : null
  if (!proveedorId.success || (otId && !otId.success)) return ir('/pedidos', 'Elige un proveedor')
  const lineasEntrada: { articuloId: string | null; descripcion: string; cantidad: string }[] = []
  for (let i = 1; i <= LINEAS; i++) {
    const art = String(fd.get(`articulo${i}`) ?? '').trim()
    const desc = String(fd.get(`descripcion${i}`) ?? '').trim().slice(0, 200)
    const cant = String(fd.get(`cantidad${i}`) ?? '').trim()
    if (!art && !desc && !cant) continue
    if (art && !Id.safeParse(art).success) return ir('/pedidos', 'Artículo inválido')
    lineasEntrada.push({ articuloId: art || null, descripcion: desc, cantidad: cant })
  }
  let nuevoId: string | null = null
  const msg = await intentar(() =>
    conPermiso('almacen', async (tx, c) => {
      const lineas: LineaPedidoNueva[] = []
      for (const l of lineasEntrada) {
        const a = l.articuloId ? await tx.articulo.findFirst({ where: { tallerId: c.tallerId, id: l.articuloId } }) : null
        if (l.articuloId && !a) return { ok: false as const, motivo: 'Artículo no encontrado' }
        const unidad = a?.unidad === 'ml' ? 'ml' : 'ud'
        const cantidad = parsearCantidad(l.cantidad, unidad)
        if (cantidad === null || cantidad <= 0) return { ok: false as const, motivo: 'Una cantidad no es válida' }
        lineas.push({ articuloId: l.articuloId, descripcion: l.descripcion, cantidad, unidad })
      }
      const r = await crearPedido(tx as unknown as TxPedidos, { tallerId: c.tallerId, proveedorId: proveedorId.data, otId: otId?.success ? otId.data : null, notas: String(fd.get('notas') ?? '').slice(0, 500), lineas })
      if (r.ok) nuevoId = r.pedidoId
      return r
    }),
  )
  if (msg || !nuevoId) return ir('/pedidos', msg ?? 'No se pudo crear')
  return ir(`/pedidos/${nuevoId}`, 'Pedido creado en borrador. Imprímelo o cópialo para mandarlo tú', true)
}

/** Solo el dueño. NO envía nada: deja constancia de que el pedido salió (a mano) y quién lo marcó. */
export async function marcarEnviadoAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('pedidoId'))
  if (!id.success) return ir('/pedidos', 'Datos inválidos')
  const msg = await intentar(() => conPermiso('pedidos_enviar', (tx, c) => marcarPedidoEnviado(tx as unknown as TxPedidos, { tallerId: c.tallerId, pedidoId: id.data, usuarioId: c.usuarioId, ahora: new Date() })))
  return msg ? ir(`/pedidos/${id.data}`, msg) : ir(`/pedidos/${id.data}`, 'Marcado como enviado', true)
}

export async function cancelarPedidoAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('pedidoId'))
  if (!id.success) return ir('/pedidos', 'Datos inválidos')
  const msg = await intentar(() => conPermiso('almacen', (tx, c) => cancelarPedido(tx as unknown as TxPedidos, { tallerId: c.tallerId, pedidoId: id.data, ahora: new Date() })))
  return msg ? ir(`/pedidos/${id.data}`, msg) : ir('/pedidos', 'Pedido cancelado', true)
}
