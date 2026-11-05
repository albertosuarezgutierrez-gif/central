'use server'
// Albaranes de entrada: registrar (sube stock y recalcula el coste medio) y valorar con la factura del proveedor (encola el hecho de compra).
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { parsearCantidad } from '@central/module-taller'
import { conPermiso, mensajeDeAcceso } from '@/lib/contexto'
import { eurosACent } from '@/lib/ajustes'
import { registrarAlbaran, valorarAlbaran, type LineaAlbaranNueva, type TxPedidos, type ValoracionLinea } from '@/lib/pedidos'

const Id = z.string().uuid()
const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const FILAS = 8

function ir(ruta: string, msg: string | null, bueno = false): never {
  revalidatePath('/albaranes')
  revalidatePath('/articulos')
  redirect(msg ? `${ruta}?aviso=${encodeURIComponent(msg)}${bueno ? '&ok=1' : ''}` : ruta)
}

export async function registrarAlbaranAccion(fd: FormData): Promise<void> {
  const proveedorId = Id.safeParse(fd.get('proveedorId'))
  const pedidoRaw = String(fd.get('pedidoId') ?? '').trim()
  const pedidoId = pedidoRaw ? Id.safeParse(pedidoRaw) : null
  const fecha = Fecha.safeParse(fd.get('fecha'))
  const numero = z.string().trim().min(1).max(60).safeParse(fd.get('numero') ?? '')
  const volver = pedidoId?.success ? `/albaranes?pedido=${pedidoId.data}` : '/albaranes'
  if (!proveedorId.success || (pedidoId && !pedidoId.success) || !fecha.success || !numero.success) return ir(volver, 'Revisa proveedor, número y fecha')
  const filas: { pl: string | null; articulo: string | null; descripcion: string; cantidad: string; coste: string }[] = []
  for (let i = 1; i <= FILAS; i++) {
    const g = (k: string) => String(fd.get(`${k}${i}`) ?? '').trim()
    if (!g('cantidad')) continue
    const pl = g('pl'), art = g('articulo')
    if ((pl && !Id.safeParse(pl).success) || (art && !Id.safeParse(art).success)) return ir(volver, 'Datos inválidos')
    filas.push({ pl: pl || null, articulo: art || null, descripcion: g('descripcion').slice(0, 200), cantidad: g('cantidad'), coste: g('coste') })
  }
  let aviso = ''
  let nuevoId: string | null = null
  let motivo: string | null = null
  try {
    motivo = await conPermiso('almacen', async (tx, c) => {
      const lineas: LineaAlbaranNueva[] = []
      for (const f of filas) {
        const pl = f.pl ? await tx.pedidoLinea.findFirst({ where: { tallerId: c.tallerId, id: f.pl } }) : null
        const art = f.articulo ? await tx.articulo.findFirst({ where: { tallerId: c.tallerId, id: f.articulo } }) : null
        const ml = (art?.unidad ?? pl?.unidad) === 'ml'
        const cantidad = parsearCantidad(f.cantidad, ml ? 'ml' : 'ud')
        if (cantidad === null || cantidad <= 0) return 'Una cantidad no es válida'
        const coste = f.coste ? eurosACent(f.coste) : null
        if (f.coste && coste === null) return 'Un precio no es válido'
        lineas.push({ pedidoLineaId: f.pl, articuloId: f.articulo, descripcion: f.descripcion, cantidad, costeUnitarioCent: coste })
      }
      const r = await registrarAlbaran(tx as unknown as TxPedidos, {
        tallerId: c.tallerId, usuarioId: c.usuarioId, proveedorId: proveedorId.data, pedidoId: pedidoId?.success ? pedidoId.data : null,
        numeroProveedor: numero.data, fecha: fecha.data, lineas,
      })
      if (!r.ok) return r.motivo
      nuevoId = r.albaranId
      aviso = r.avisos.map((a) => a.texto).join(' · ')
      return null
    }, { timeout: 30_000 })
  } catch (e) {
    motivo = mensajeDeAcceso(e)
    if (!motivo) { console.error('[albaranes]', e); motivo = 'No se pudo completar. Inténtalo de nuevo' }
  }
  if (motivo || !nuevoId) return ir(volver, motivo ?? 'No se pudo registrar')
  return ir(`/albaranes/${nuevoId}`, `Albarán registrado: stock y coste medio actualizados.${aviso ? ' ' + aviso : ''}`, true)
}

/** Valora el albarán con la factura del proveedor: precios de las líneas sin precio + número y fecha de la factura. */
export async function valorarAlbaranAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('albaranId'))
  const factura = z.string().trim().min(1).max(60).safeParse(fd.get('facturaNumero') ?? '')
  const fecha = Fecha.safeParse(fd.get('facturaFecha'))
  if (!id.success || !factura.success || !fecha.success) return ir('/albaranes', 'Revisa el número y la fecha de la factura')
  const volver = `/albaranes/${id.data}`
  const costes: ValoracionLinea[] = []
  for (const [k, v] of fd.entries()) {
    const m = /^coste_(.+)$/.exec(k)
    if (!m || typeof v !== 'string' || !v.trim()) continue
    if (!Id.safeParse(m[1]).success) return ir(volver, 'Datos inválidos')
    const c = eurosACent(v)
    if (c === null) return ir(volver, 'Un precio no es válido')
    costes.push({ lineaId: m[1], costeUnitarioCent: c })
  }
  let motivo: string | null = null
  try {
    motivo = await conPermiso('almacen', async (tx, c) => {
      const r = await valorarAlbaran(tx as unknown as TxPedidos, { tallerId: c.tallerId, albaranId: id.data, facturaNumero: factura.data, facturaFecha: fecha.data, costes, ahora: new Date() })
      return r.ok ? null : r.motivo
    }, { timeout: 30_000 })
  } catch (e) {
    motivo = mensajeDeAcceso(e)
    if (!motivo) { console.error('[albaranes/valorar]', e); motivo = 'No se pudo completar. Inténtalo de nuevo' }
  }
  return motivo ? ir(volver, motivo) : ir(volver, 'Albarán valorado con la factura. La compra queda preparada para contabilidad.', true)
}
