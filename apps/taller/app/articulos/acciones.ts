'use server'
// Acciones de artículos e inventario por <form action>. Cada una: sesión → conPermiso('almacen') (rol re-leído en BD) → lib/stock.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { conPermiso, mensajeDeAcceso } from '@/lib/contexto'
import { eurosACent, porcentajeAPb } from '@/lib/ajustes'
import { parsearCantidad, esUnidadStock } from '@central/module-taller'
import { ajustarInventario, anadirRecambioDesdeCatalogo, crearArticulo, editarArticulo, type DatosArticulo, type TxStock } from '@/lib/stock'

const Id = z.string().uuid()
const Txt = (max: number) => z.string().trim().max(max)

function ir(ruta: string, msg: string | null, bueno = false): never {
  revalidatePath('/articulos')
  redirect(msg ? `${ruta}?aviso=${encodeURIComponent(msg)}${bueno ? '&ok=1' : ''}` : ruta)
}
async function intentar(fn: () => Promise<{ ok: true } | { ok: false; motivo: string }>): Promise<string | null> {
  try {
    const r = await fn()
    return r.ok ? null : r.motivo
  } catch (e) {
    const m = mensajeDeAcceso(e)
    if (m) return m
    console.error('[articulos]', e)
    return 'No se pudo completar. Inténtalo de nuevo'
  }
}

/** Formulario → datos del artículo. Euros con coma; margen en %; mínimo y envase en la unidad del artículo (litros para granel). */
function datosDe(fd: FormData): DatosArticulo | string {
  const unidadTxt = Txt(5).safeParse(fd.get('unidad') ?? '')
  if (!unidadTxt.success || !esUnidadStock(unidadTxt.data)) return 'Unidad no válida'
  const unidad = unidadTxt.data
  const campo = (n: string, max: number) => { const v = Txt(max).safeParse(fd.get(n) ?? ''); return v.success ? v.data : null }
  const descripcion = campo('descripcion', 200)
  if (descripcion === null) return 'Descripción demasiado larga'
  const opc = <T,>(n: string, conv: (s: string) => T | null, etiqueta: string): T | null | string => {
    const t = (campo(n, 30) ?? '').trim()
    if (!t) return null
    const v = conv(t)
    return v === null ? `${etiqueta} no válido` : v
  }
  const pvp = opc('pvp', eurosACent, 'El PVP')
  const margen = opc('margen', porcentajeAPb, 'El margen')
  const minimo = opc('minimo', (s) => parsearCantidad(s, unidad), 'El stock mínimo')
  const envase = opc('envase', (s) => parsearCantidad(s, 'ml'), 'El envase')
  for (const v of [pvp, margen, minimo, envase]) if (typeof v === 'string') return v
  return {
    referencia: campo('referencia', 60), referenciaFabricante: campo('referenciaFabricante', 60), descripcion, marca: campo('marca', 60),
    unidad, minimo: minimo as number | null, pvpCent: pvp as number | null, margenPuntosBasicos: margen as number | null,
    ivaCodigo: campo('ivaCodigo', 40) || null, mlPorEnvase: unidad === 'ml' ? (envase as number | null) : null,
  }
}

export async function crearArticuloAccion(fd: FormData): Promise<void> {
  const d = datosDe(fd)
  if (typeof d === 'string') return ir('/articulos', d)
  const msg = await intentar(() => conPermiso('almacen', (tx, c) => crearArticulo(tx as unknown as TxStock, { tallerId: c.tallerId, datos: d })))
  return msg ? ir('/articulos', msg) : ir('/articulos', 'Artículo creado', true)
}

export async function editarArticuloAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('id'))
  const d = datosDe(fd)
  if (!id.success) return ir('/articulos', 'Datos inválidos')
  if (typeof d === 'string') return ir('/articulos', d)
  const activo = fd.get('activo') === 'on'
  const msg = await intentar(() => conPermiso('almacen', (tx, c) => editarArticulo(tx as unknown as TxStock, { tallerId: c.tallerId, articuloId: id.data, datos: d, activo })))
  return msg ? ir('/articulos', msg) : ir('/articulos', 'Guardado', true)
}

/** Inventario: el usuario cuenta lo que hay (en la unidad del artículo; litros para granel) y escribe el motivo. */
export async function ajustarInventarioAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('id'))
  const nota = Txt(300).safeParse(fd.get('nota') ?? '')
  if (!id.success || !nota.success) return ir('/articulos', 'Datos inválidos')
  const texto = String(fd.get('contado') ?? '')
  const msg = await intentar(() =>
    conPermiso('almacen', async (tx, c) => {
      const a = await tx.articulo.findFirst({ where: { tallerId: c.tallerId, id: id.data } })
      if (!a) return { ok: false as const, motivo: 'Artículo no encontrado' }
      const contado = parsearCantidad(texto, a.unidad === 'ml' ? 'ml' : 'ud')
      if (contado === null) return { ok: false as const, motivo: 'El recuento no es válido' }
      return ajustarInventario(tx as unknown as TxStock, { tallerId: c.tallerId, usuarioId: c.usuarioId, articuloId: id.data, contado, nota: nota.data })
    }),
  )
  return msg ? ir('/articulos', msg) : ir('/articulos', 'Inventario ajustado', true)
}

/** Desde la OT: añade un recambio del catálogo (precio y coste salen del artículo). `aceptado` = el cliente ya lo aceptó. */
export async function anadirRecambioAccion(fd: FormData): Promise<void> {
  const otId = Id.safeParse(fd.get('otId'))
  const articuloId = Id.safeParse(fd.get('articuloId'))
  if (!otId.success) return ir('/ordenes', 'Datos inválidos')
  const volver = `/ordenes/${otId.data}`
  if (!articuloId.success) return ir(volver, 'Elige un artículo')
  const texto = String(fd.get('cantidad') ?? '')
  const aceptado = fd.get('aceptado') === 'on'
  let aviso: string | null = null
  const msg = await intentar(() =>
    conPermiso('ampliaciones', async (tx, c) => {
      const a = await tx.articulo.findFirst({ where: { tallerId: c.tallerId, id: articuloId.data } })
      if (!a) return { ok: false as const, motivo: 'Artículo no encontrado' }
      const cantidad = parsearCantidad(texto, a.unidad === 'ml' ? 'ml' : 'ud')
      if (cantidad === null || cantidad <= 0) return { ok: false as const, motivo: 'Cantidad no válida' }
      const r = await anadirRecambioDesdeCatalogo(tx as unknown as TxStock, { tallerId: c.tallerId, otId: otId.data, articuloId: articuloId.data, cantidad, aceptadaEn: aceptado ? new Date() : null })
      if (r.ok) aviso = r.avisoStock
      return r
    }),
  )
  revalidatePath(volver)
  return msg ? ir(volver, msg) : ir(volver, aviso ?? (aceptado ? 'Recambio añadido' : 'Recambio añadido (pendiente de aceptar por el cliente: no entra en la factura hasta entonces)'), !aviso)
}
