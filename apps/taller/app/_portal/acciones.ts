'use server'
// Acciones del PORTAL DEL PROVEEDOR del lado del taller (con sesión). Nada se envía desde el servidor: el enlace se devuelve UNA vez y
// el dueño lo comparte desde su móvil (Web Share) o lo copia. El 2.º enlace solo nace con «Recepción verificada» (una persona).
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conPermiso, mensajeDeAcceso } from '@/lib/contexto'
import { conTaller } from '@/lib/db'
import { almacenActivo } from '@/lib/almacen'
import { origenPublico } from '@/lib/enlaces'
import {
  confirmarFactura, corregirFactura, crearEnlacePedido, procesarFactura, rechazarFactura, verificarRecepcion, type CorreccionFactura, type TxPortal,
} from '@/lib/portal-proveedor'
import { extractorFacturaIa } from '@/lib/extractor-factura'
import { aceptarRecambio, type TxRecambios } from '@/lib/recambios-pendientes'

export type Resp<T = object> = ({ ok: true } & T) | { ok: false; mensaje: string }
const uuid = z.string().uuid()
const tx = (t: unknown) => t as unknown as TxPortal
function fallo(e: unknown, donde: string): { ok: false; mensaje: string } {
  const m = mensajeDeAcceso(e)
  if (m) return { ok: false, mensaje: m }
  console.error(`[portal/${donde}]`, e instanceof Error ? e.message : e)
  return { ok: false, mensaje: 'No se pudo completar. Inténtalo de nuevo' }
}
async function origen(): Promise<string | null> {
  const h = await headers()
  return origenPublico(process.env, h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'))
}

/** Enlace del PEDIDO para el proveedor (solo el dueño: generarlo es mandarlo). Anula el anterior. */
export async function enlacePedidoAccion(pedidoId: unknown): Promise<Resp<{ url: string; caducaEn: string }>> {
  const id = uuid.safeParse(pedidoId)
  if (!id.success) return { ok: false, mensaje: 'Datos inválidos' }
  const o = await origen()
  try {
    return await conPermiso('pedidos_enviar', async (t, c) => {
      const r = await crearEnlacePedido(tx(t), { tallerId: c.tallerId, usuarioId: c.usuarioId, pedidoId: id.data, ahora: new Date() })
      if (!r.ok) return { ok: false as const, mensaje: r.motivo }
      revalidatePath(`/pedidos/${id.data}`)
      return { ok: true as const, url: `${o ?? ''}/prov/${r.token}`, caducaEn: r.caducaEn.toISOString() }
    })
  } catch (e) { return fallo(e, 'enlace-pedido') }
}

/** «Recepción verificada» (una persona) → enlace de la FACTURA para el proveedor. */
export async function recepcionVerificadaAccion(albaranId: unknown): Promise<Resp<{ url: string; caducaEn: string }>> {
  const id = uuid.safeParse(albaranId)
  if (!id.success) return { ok: false, mensaje: 'Datos inválidos' }
  const o = await origen()
  try {
    return await conPermiso('almacen', async (t, c) => {
      const r = await verificarRecepcion(tx(t), { tallerId: c.tallerId, usuarioId: c.usuarioId, albaranId: id.data, ahora: new Date() })
      if (!r.ok) return { ok: false as const, mensaje: r.motivo }
      revalidatePath(`/albaranes/${id.data}`)
      return { ok: true as const, url: `${o ?? ''}/prov/${r.token}`, caducaEn: r.caducaEn.toISOString() }
    })
  } catch (e) { return fallo(e, 'recepcion') }
}

/** Confirmar una factura en «Revisar» = aceptar las diferencias señaladas y contabilizarla. Solo el dueño. */
export async function confirmarFacturaAccion(documentoId: unknown, albaranId: unknown): Promise<Resp<{ contabilizada: boolean; motivo?: string }>> {
  const d = uuid.safeParse(documentoId), a = uuid.safeParse(albaranId)
  if (!d.success || !a.success) return { ok: false, mensaje: 'Datos inválidos' }
  try {
    return await conPermiso('pedidos_enviar', async (t, c) => {
      const r = await confirmarFactura(tx(t), { tallerId: c.tallerId, documentoId: d.data, usuarioId: c.usuarioId, ahora: new Date() })
      revalidatePath(`/albaranes/${a.data}`)
      return r.ok ? r : { ok: false as const, mensaje: r.motivo }
    })
  } catch (e) { return fallo(e, 'confirmar') }
}

const Correccion = z.object({
  nifEmisor: z.string().max(20).nullable().optional(),
  numero: z.string().max(60).nullable().optional(),
  fecha: z.string().max(10).nullable().optional(),
  totalCent: z.number().int().min(0).max(1e11).nullable().optional(),
  lineas: z.array(z.object({
    indice: z.number().int().min(0).max(300),
    precioUnitCent: z.number().int().min(0).max(1e10).nullable().optional(),
    ivaPb: z.number().int().min(0).max(10_000).nullable().optional(),
    cantidadMil: z.number().int().min(0).max(1e10).nullable().optional(),
  })).max(300).optional(),
  guardarNifProveedor: z.boolean().optional(),
})

/** Corregir lo leído de la factura y volver a casar (si ahora cuadra, se contabiliza por case). Solo el dueño. */
export async function corregirFacturaAccion(documentoId: unknown, albaranId: unknown, correccion: unknown): Promise<Resp<{ estado: string }>> {
  const d = uuid.safeParse(documentoId), a = uuid.safeParse(albaranId), c = Correccion.safeParse(correccion)
  if (!d.success || !a.success || !c.success) return { ok: false, mensaje: 'Datos inválidos' }
  try {
    return await conPermiso('pedidos_enviar', async (t, s) => {
      const r = await corregirFactura(tx(t), { tallerId: s.tallerId, documentoId: d.data, usuarioId: s.usuarioId, ahora: new Date(), correccion: c.data as CorreccionFactura })
      revalidatePath(`/albaranes/${a.data}`)
      return r.ok ? r : { ok: false as const, mensaje: r.motivo }
    })
  } catch (e) { return fallo(e, 'corregir') }
}

export async function rechazarFacturaAccion(documentoId: unknown, albaranId: unknown, nota: unknown): Promise<Resp> {
  const d = uuid.safeParse(documentoId), a = uuid.safeParse(albaranId), n = z.string().max(300).safeParse(nota ?? '')
  if (!d.success || !a.success || !n.success) return { ok: false, mensaje: 'Datos inválidos' }
  try {
    return await conPermiso('almacen', async (t, s) => {
      const r = await rechazarFactura(tx(t), { tallerId: s.tallerId, documentoId: d.data, usuarioId: s.usuarioId, nota: n.data, ahora: new Date() })
      revalidatePath(`/albaranes/${a.data}`)
      return r.ok ? { ok: true as const } : { ok: false as const, mensaje: r.motivo }
    })
  } catch (e) { return fallo(e, 'rechazar') }
}

/** Volver a leer una factura «ilegible» o aún «recibida» (p. ej. la IA no respondió). */
export async function leerFacturaAccion(documentoId: unknown, albaranId: unknown): Promise<Resp<{ estado: string }>> {
  const d = uuid.safeParse(documentoId), a = uuid.safeParse(albaranId)
  if (!d.success || !a.success) return { ok: false, mensaje: 'Datos inválidos' }
  try {
    // Solo comprueba el permiso; la lectura (IA) va fuera de esta transacción.
    const tallerId = await conPermiso('almacen', async (_t, s) => s.tallerId)
    const r = await procesarFactura({
      conTaller: (id, fn) => conTaller(id, (t) => fn(tx(t)), { timeout: 30_000 }),
      leer: async (id, ruta) => (await almacenActivo().leer?.(id, ruta)) ?? null,
      extractor: extractorFacturaIa,
    }, { tallerId, documentoId: d.data, ahora: new Date() })
    revalidatePath(`/albaranes/${a.data}`)
    return r.ok ? r : { ok: false, mensaje: r.motivo }
  } catch (e) { return fallo(e, 'leer') }
}

/** «Recambios pendientes de aceptar»: el cliente ya dijo que sí → entra en la factura (y saldrá del stock al cerrar). */
export async function aceptarRecambioAccion(otId: unknown, lineaId: unknown): Promise<Resp> {
  const o = uuid.safeParse(otId), l = uuid.safeParse(lineaId)
  if (!o.success || !l.success) return { ok: false, mensaje: 'Datos inválidos' }
  try {
    return await conPermiso('ampliaciones', async (t, s) => {
      const r = await aceptarRecambio(t as unknown as TxRecambios, { tallerId: s.tallerId, otId: o.data, lineaId: l.data, usuarioId: s.usuarioId, ahora: new Date() })
      revalidatePath(`/ordenes/${o.data}`)
      return r.ok ? { ok: true as const } : { ok: false as const, mensaje: r.motivo }
    })
  } catch (e) { return fallo(e, 'recambio') }
}
