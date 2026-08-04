// Servicio de eventos/alquileres (Fase 2). Cada transición mueve stock entre
// estados (disponible/reservado/fuera) en la misma transacción que su movimiento.
// Matemática pura en @central/module-materiales (eventos.ts).
import { prisma } from './db'
import { recomputarTotales, type Tx } from './almacen'
import { reservar, cancelarReserva, entregar, devolver, type CeldaEvento } from '@central/module-materiales'

async function celda(tx: Tx, materialId: string, espacioId: string): Promise<CeldaEvento> {
  const s = await tx.almacenStock.findUnique({ where: { materialId_espacioId: { materialId, espacioId } } })
  return {
    disponible: s?.disponible ?? 0,
    reservado: s?.reservado ?? 0,
    enTransito: s?.enTransito ?? 0,
    fuera: s?.fuera ?? 0,
  }
}

async function setCelda(tx: Tx, cuentaId: string, materialId: string, espacioId: string, c: CeldaEvento) {
  await tx.almacenStock.upsert({
    where: { materialId_espacioId: { materialId, espacioId } },
    create: { cuentaId, materialId, espacioId, disponible: c.disponible, reservado: c.reservado, enTransito: c.enTransito, fuera: c.fuera },
    update: { disponible: c.disponible, reservado: c.reservado, enTransito: c.enTransito, fuera: c.fuera },
  })
}

export interface EventoInput {
  tipo: 'evento' | 'alquiler'
  titulo: string
  clienteNombre?: string | null
  clienteContacto?: string | null
  lugar?: string | null
  fechaInicio: string // YYYY-MM-DD
  fechaFin: string
  notas?: string | null
}

const limpio = (v?: string | null) => (v?.trim() ? v.trim() : null)

export async function crearEvento(cuentaId: string, actor: string, input: EventoInput) {
  if (!input.titulo.trim()) throw new Error('El título es obligatorio')
  if (input.fechaFin < input.fechaInicio) throw new Error('La fecha de fin no puede ser anterior al inicio')
  return prisma.almacenEvento.create({
    data: {
      cuentaId,
      tipo: input.tipo,
      titulo: input.titulo.trim(),
      clienteNombre: limpio(input.clienteNombre),
      clienteContacto: limpio(input.clienteContacto),
      lugar: limpio(input.lugar),
      fechaInicio: new Date(input.fechaInicio),
      fechaFin: new Date(input.fechaFin),
      estado: 'presupuesto',
      notas: limpio(input.notas),
      creadoPor: actor,
    },
  })
}

/** Añade una línea de material (solo mientras el evento está en presupuesto). */
export async function addLinea(
  cuentaId: string,
  input: { eventoId: string; materialId: string; espacioId: string; cantidad: number },
) {
  const cantidad = Math.trunc(input.cantidad)
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor que 0')
  return prisma.$transaction(async (tx) => {
    const ev = await tx.almacenEvento.findFirst({ where: { id: input.eventoId, cuentaId } })
    if (!ev) throw new Error('Evento no encontrado')
    if (ev.estado !== 'presupuesto') throw new Error('Solo se pueden añadir líneas en presupuesto')
    const [mat, esp] = await Promise.all([
      tx.almacenMaterial.findFirst({ where: { id: input.materialId, cuentaId }, select: { id: true } }),
      tx.almacenEspacio.findFirst({ where: { id: input.espacioId, cuentaId }, select: { id: true } }),
    ])
    if (!mat) throw new Error('Material no encontrado')
    if (!esp) throw new Error('Almacén no encontrado')
    return tx.almacenEventoLinea.create({
      data: { cuentaId, eventoId: input.eventoId, materialId: input.materialId, espacioId: input.espacioId, cantidad },
    })
  })
}

export async function borrarLinea(cuentaId: string, lineaId: string) {
  return prisma.$transaction(async (tx) => {
    const l = await tx.almacenEventoLinea.findFirst({ where: { id: lineaId, cuentaId } })
    if (!l) throw new Error('Línea no encontrada')
    const ev = await tx.almacenEvento.findFirst({ where: { id: l.eventoId, cuentaId } })
    if (!ev || ev.estado !== 'presupuesto') throw new Error('Solo se pueden borrar líneas en presupuesto')
    await tx.almacenEventoLinea.delete({ where: { id: lineaId } })
  })
}

/** Confirma: reserva el stock (disponible → reservado) de cada línea. */
export async function confirmarEvento(cuentaId: string, actor: string, eventoId: string) {
  return prisma.$transaction(async (tx) => {
    const ev = await tx.almacenEvento.findFirst({ where: { id: eventoId, cuentaId } })
    if (!ev) throw new Error('Evento no encontrado')
    if (ev.estado !== 'presupuesto') throw new Error('El evento no está en presupuesto')
    const lineas = await tx.almacenEventoLinea.findMany({ where: { eventoId } })
    if (lineas.length === 0) throw new Error('Añade al menos una línea antes de confirmar')
    const materiales = new Set<string>()
    for (const l of lineas) {
      const c = await celda(tx, l.materialId, l.espacioId)
      let nueva: CeldaEvento
      try {
        nueva = reservar(c, l.cantidad)
      } catch {
        const m = await tx.almacenMaterial.findUnique({ where: { id: l.materialId }, select: { nombre: true } })
        throw new Error(`Sin stock suficiente para reservar ${l.cantidad} de "${m?.nombre ?? l.materialId}"`)
      }
      await setCelda(tx, cuentaId, l.materialId, l.espacioId, nueva)
      await tx.almacenMovimiento.create({
        data: { cuentaId, materialId: l.materialId, tipo: 'reserva', cantidad: l.cantidad, espacioOrigenId: l.espacioId, eventoId, motivo: `Reserva ${ev.titulo}`, realizadoPor: actor },
      })
      materiales.add(l.materialId)
    }
    await tx.almacenEvento.update({ where: { id: eventoId }, data: { estado: 'confirmado' } })
    for (const mId of materiales) await recomputarTotales(tx, mId)
  })
}

/** Entrega: reservado → fuera (salida física) de cada línea. */
export async function entregarEvento(cuentaId: string, actor: string, eventoId: string) {
  return prisma.$transaction(async (tx) => {
    const ev = await tx.almacenEvento.findFirst({ where: { id: eventoId, cuentaId } })
    if (!ev) throw new Error('Evento no encontrado')
    if (ev.estado !== 'confirmado') throw new Error('Solo se entrega un evento confirmado')
    const lineas = await tx.almacenEventoLinea.findMany({ where: { eventoId } })
    const materiales = new Set<string>()
    for (const l of lineas) {
      const pendiente = l.cantidad - l.entregada
      if (pendiente <= 0) continue
      const c = await celda(tx, l.materialId, l.espacioId)
      await setCelda(tx, cuentaId, l.materialId, l.espacioId, entregar(c, pendiente))
      await tx.almacenEventoLinea.update({ where: { id: l.id }, data: { entregada: l.cantidad } })
      await tx.almacenMovimiento.create({
        data: { cuentaId, materialId: l.materialId, tipo: 'salida', cantidad: pendiente, espacioOrigenId: l.espacioId, eventoId, motivo: `Entrega ${ev.titulo}`, realizadoPor: actor },
      })
      materiales.add(l.materialId)
    }
    await tx.almacenEvento.update({ where: { id: eventoId }, data: { estado: 'entregado' } })
    for (const mId of materiales) await recomputarTotales(tx, mId)
  })
}

/** Devuelve: fuera → disponible (buenas) + roturas (perdidas) por línea. */
export async function devolverEvento(
  cuentaId: string,
  actor: string,
  eventoId: string,
  devoluciones: { lineaId: string; buenas: number; rotas: number }[],
) {
  return prisma.$transaction(async (tx) => {
    const ev = await tx.almacenEvento.findFirst({ where: { id: eventoId, cuentaId } })
    if (!ev) throw new Error('Evento no encontrado')
    if (ev.estado !== 'entregado') throw new Error('Solo se devuelve un evento entregado')
    const materiales = new Set<string>()
    for (const d of devoluciones) {
      const buenas = Math.trunc(d.buenas), rotas = Math.trunc(d.rotas)
      if (buenas + rotas <= 0) continue
      const l = await tx.almacenEventoLinea.findFirst({ where: { id: d.lineaId, eventoId, cuentaId } })
      if (!l) throw new Error('Línea no encontrada')
      const pendiente = l.entregada - l.devuelta - l.danada
      if (buenas + rotas > pendiente) throw new Error('Devuelves más de lo que queda fuera en esa línea')
      const c = await celda(tx, l.materialId, l.espacioId)
      const r = devolver(c, buenas, rotas)
      await setCelda(tx, cuentaId, l.materialId, l.espacioId, r.celda)
      await tx.almacenEventoLinea.update({ where: { id: l.id }, data: { devuelta: l.devuelta + buenas, danada: l.danada + rotas } })
      if (buenas > 0) await tx.almacenMovimiento.create({
        data: { cuentaId, materialId: l.materialId, tipo: 'devolucion', cantidad: buenas, espacioDestinoId: l.espacioId, eventoId, motivo: `Devolución ${ev.titulo}`, realizadoPor: actor },
      })
      if (rotas > 0) await tx.almacenMovimiento.create({
        data: { cuentaId, materialId: l.materialId, tipo: 'rotura', cantidad: rotas, espacioOrigenId: l.espacioId, eventoId, motivo: `Rotura en ${ev.titulo}`, realizadoPor: actor },
      })
      materiales.add(l.materialId)
    }
    // ¿Todo devuelto? → cerrar.
    const lineas = await tx.almacenEventoLinea.findMany({ where: { eventoId } })
    const cerrado = lineas.every((l) => l.entregada - l.devuelta - l.danada === 0)
    await tx.almacenEvento.update({ where: { id: eventoId }, data: { estado: cerrado ? 'devuelto' : 'entregado' } })
    for (const mId of materiales) await recomputarTotales(tx, mId)
    return { cerrado }
  })
}

/** Cancela un evento en presupuesto o confirmado (libera reservas). */
export async function cancelarEvento(cuentaId: string, actor: string, eventoId: string) {
  return prisma.$transaction(async (tx) => {
    const ev = await tx.almacenEvento.findFirst({ where: { id: eventoId, cuentaId } })
    if (!ev) throw new Error('Evento no encontrado')
    if (ev.estado === 'entregado' || ev.estado === 'devuelto' || ev.estado === 'cerrado') {
      throw new Error('No se puede cancelar un evento ya entregado; devuélvelo primero')
    }
    const materiales = new Set<string>()
    if (ev.estado === 'confirmado') {
      const lineas = await tx.almacenEventoLinea.findMany({ where: { eventoId } })
      for (const l of lineas) {
        const c = await celda(tx, l.materialId, l.espacioId)
        await setCelda(tx, cuentaId, l.materialId, l.espacioId, cancelarReserva(c, l.cantidad))
        await tx.almacenMovimiento.create({
          data: { cuentaId, materialId: l.materialId, tipo: 'reserva', cantidad: l.cantidad, espacioDestinoId: l.espacioId, eventoId, motivo: `Cancelación ${ev.titulo}`, realizadoPor: actor },
        })
        materiales.add(l.materialId)
      }
    }
    await tx.almacenEvento.update({ where: { id: eventoId }, data: { estado: 'cancelado' } })
    for (const mId of materiales) await recomputarTotales(tx, mId)
  })
}
