// Catálogo público de alquiler (Fase 4). Escaparate SIN sesión: el cliente ve el
// material alquilable con su precio y las UNIDADES REALES disponibles.
//
// Prioridad de eventos (requisito de Alberto): la disponibilidad que ve la web es el
// `disponible` del stock, y confirmar un evento/alquiler internamente mueve
// disponible → reservado (ver lib/eventos.ts). Por eso, en cuanto la oficina confirma
// un evento, esas cajas dejan de aparecer disponibles en la web automáticamente: nadie
// puede reservar por web lo que ya está comprometido para un evento.
//
// La reserva con cobro (Stripe) aún no está conectada; hasta entonces una solicitud web
// crea un PRESUPUESTO que la oficina revisa y confirma (momento en que se reserva el
// stock). Ese es el único punto pendiente de Fase 4 — ver docs/CONTEXTO-SESIONES.md.
import { prisma } from './db'

/** Cuenta cuyo catálogo se publica. Configurable; por defecto la cuenta DEMO de Joaquín Jaén. */
export const CUENTA_PUBLICA =
  process.env.ALMACEN_PUBLIC_CUENTA_ID || '0de50000-0000-4000-a000-000000000001'

const num = (v: unknown): number => (v == null ? 0 : Number(v))

export interface ItemCatalogo {
  id: string
  nombre: string
  categoria: string
  capacidad: string | null
  imagenUrl: string | null
  precioAlquiler: number
  disponible: number
}

type Fila = {
  id: string
  nombre: string
  categoria: string
  capacidad: string | null
  imagen_url: string | null
  precio_alquiler: unknown
  disponible: bigint | number | null
}

/**
 * Lista los materiales alquilables (precio de alquiler > 0) con la suma de unidades
 * DISPONIBLES en todos los almacenes. Ordena por disponibilidad desc y nombre.
 */
export async function catalogoPublico(cuentaId = CUENTA_PUBLICA): Promise<ItemCatalogo[]> {
  const { Prisma } = await import('@prisma/client')
  const filas = await prisma.$queryRaw<Fila[]>(Prisma.sql`
    SELECT m.id, m.nombre, m.categoria, m.capacidad, m.imagen_url, m.precio_alquiler,
           COALESCE(SUM(s.disponible), 0) AS disponible
    FROM almacen_materiales m
    LEFT JOIN almacen_stock s ON s.material_id = m.id
    WHERE m.cuenta_id = ${cuentaId}::uuid AND m.activo = true
      AND m.precio_alquiler IS NOT NULL AND m.precio_alquiler > 0
    GROUP BY m.id
    ORDER BY (COALESCE(SUM(s.disponible), 0) > 0) DESC, m.nombre ASC
  `)
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    categoria: f.categoria,
    capacidad: f.capacidad,
    imagenUrl: f.imagen_url,
    precioAlquiler: num(f.precio_alquiler),
    disponible: Number(f.disponible ?? 0),
  }))
}

/** Ficha pública de un material alquilable (o null si no existe / no es alquilable). */
export async function itemPublico(id: string, cuentaId = CUENTA_PUBLICA): Promise<ItemCatalogo | null> {
  const { Prisma } = await import('@prisma/client')
  const filas = await prisma.$queryRaw<Fila[]>(Prisma.sql`
    SELECT m.id, m.nombre, m.categoria, m.capacidad, m.imagen_url, m.precio_alquiler,
           COALESCE(SUM(s.disponible), 0) AS disponible
    FROM almacen_materiales m
    LEFT JOIN almacen_stock s ON s.material_id = m.id
    WHERE m.id = ${id}::uuid AND m.cuenta_id = ${cuentaId}::uuid AND m.activo = true
      AND m.precio_alquiler IS NOT NULL AND m.precio_alquiler > 0
    GROUP BY m.id
  `)
  const f = filas[0]
  if (!f) return null
  return {
    id: f.id,
    nombre: f.nombre,
    categoria: f.categoria,
    capacidad: f.capacidad,
    imagenUrl: f.imagen_url,
    precioAlquiler: num(f.precio_alquiler),
    disponible: Number(f.disponible ?? 0),
  }
}

export interface SolicitudInput {
  clienteNombre: string
  clienteContacto: string
  lugar?: string | null
  fechaInicio: string // YYYY-MM-DD
  fechaFin: string
  notas?: string | null
  lineas: { materialId: string; cantidad: number }[]
}

const limpio = (v?: string | null) => (v?.trim() ? v.trim() : null)

/**
 * Crea una SOLICITUD de alquiler desde la web pública: un evento tipo `alquiler` en
 * estado `presupuesto` con sus líneas. NO reserva stock — la oficina la revisa y
 * confirma (ahí se reserva). Devuelve el id del evento creado.
 *
 * Valida contra el catálogo real: cada material debe existir, ser alquilable y la
 * cantidad pedida no puede superar las unidades disponibles ahora mismo.
 */
export async function crearSolicitud(input: SolicitudInput, cuentaId = CUENTA_PUBLICA): Promise<{ id: string }> {
  const nombre = input.clienteNombre?.trim()
  const contacto = input.clienteContacto?.trim()
  if (!nombre) throw new Error('Falta tu nombre')
  if (!contacto) throw new Error('Falta un email o teléfono de contacto')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(input.fechaFin)) {
    throw new Error('Fechas no válidas')
  }
  if (input.fechaFin < input.fechaInicio) throw new Error('La fecha de fin no puede ser anterior al inicio')

  const lineas = (input.lineas || [])
    .map((l) => ({ materialId: l.materialId, cantidad: Math.trunc(Number(l.cantidad) || 0) }))
    .filter((l) => l.cantidad > 0)
  if (lineas.length === 0) throw new Error('Añade al menos un material')
  if (lineas.length > 50) throw new Error('Demasiadas líneas en una sola solicitud')

  const espacio = await prisma.almacenEspacio.findFirst({
    where: { cuentaId, activo: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!espacio) throw new Error('No hay almacén configurado')

  // Valida materiales y disponibilidad real.
  for (const l of lineas) {
    const item = await itemPublico(l.materialId, cuentaId)
    if (!item) throw new Error('Uno de los materiales ya no está disponible')
    if (l.cantidad > item.disponible) {
      throw new Error(`Solo quedan ${item.disponible} de "${item.nombre}"`)
    }
  }

  return prisma.$transaction(async (tx) => {
    const ev = await tx.almacenEvento.create({
      data: {
        cuentaId,
        tipo: 'alquiler',
        titulo: `Solicitud web · ${nombre}`,
        clienteNombre: nombre,
        clienteContacto: contacto,
        lugar: limpio(input.lugar),
        fechaInicio: new Date(input.fechaInicio),
        fechaFin: new Date(input.fechaFin),
        estado: 'presupuesto',
        notas: limpio(input.notas),
        creadoPor: 'web',
      },
    })
    for (const l of lineas) {
      await tx.almacenEventoLinea.create({
        data: { cuentaId, eventoId: ev.id, materialId: l.materialId, espacioId: espacio.id, cantidad: l.cantidad },
      })
    }
    return { id: ev.id }
  })
}
