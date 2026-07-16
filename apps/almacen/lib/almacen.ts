// Capa de servicio del almacén (Fase 1). Cada operación que toca stock escribe
// también su movimiento en el libro, dentro de UNA transacción Prisma, para que
// nunca haya descuadre. La matemática pura vive en @central/module-materiales.
import { prisma } from './db'
import { iniciarTraspaso, confirmarRecepcion } from '@central/module-materiales'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export type TipoMovManual = 'entrada' | 'salida' | 'devolucion' | 'rotura' | 'ajuste'

export interface MovimientoInput {
  materialId: string
  tipo: TipoMovManual
  cantidad: number // >0 salvo 'ajuste' (admite negativo)
  espacioId: string
  motivo?: string
}

const MOTIVO_OBLIGATORIO: TipoMovManual[] = ['ajuste', 'rotura']

/** Recalcula los contadores globales del material = suma sobre todos los almacenes. */
async function recomputarTotales(tx: Tx, materialId: string) {
  const rows = await tx.almacenStock.findMany({
    where: { materialId },
    select: { disponible: true, enTransito: true },
  })
  const disponible = rows.reduce((s, r) => s + r.disponible, 0)
  const total = rows.reduce((s, r) => s + r.disponible + r.enTransito, 0)
  await tx.almacenMaterial.update({
    where: { id: materialId },
    data: { cantidadDisponible: disponible, cantidadTotal: total },
  })
}

async function celda(tx: Tx, materialId: string, espacioId: string) {
  const s = await tx.almacenStock.findUnique({
    where: { materialId_espacioId: { materialId, espacioId } },
  })
  return { disponible: s?.disponible ?? 0, enTransito: s?.enTransito ?? 0 }
}

async function setCelda(
  tx: Tx,
  cuentaId: string,
  materialId: string,
  espacioId: string,
  disponible: number,
  enTransito: number,
) {
  await tx.almacenStock.upsert({
    where: { materialId_espacioId: { materialId, espacioId } },
    create: { cuentaId, materialId, espacioId, disponible, enTransito },
    update: { disponible, enTransito },
  })
}

/** Registra un movimiento manual (entrada/salida/devolución/rotura/ajuste) + actualiza stock. */
export async function registrarMovimiento(cuentaId: string, actor: string, input: MovimientoInput) {
  const { materialId, tipo, espacioId } = input
  const cantidad = Math.trunc(input.cantidad)
  const motivo = input.motivo?.trim() || null

  if (tipo === 'ajuste') {
    if (cantidad === 0) throw new Error('El ajuste no puede ser 0')
  } else if (cantidad <= 0) {
    throw new Error('La cantidad debe ser mayor que 0')
  }
  if (MOTIVO_OBLIGATORIO.includes(tipo) && !motivo) {
    throw new Error('El motivo es obligatorio en ajustes y roturas')
  }

  return prisma.$transaction(async (tx) => {
    // Validar pertenencia
    const [mat, esp] = await Promise.all([
      tx.almacenMaterial.findFirst({ where: { id: materialId, cuentaId }, select: { id: true } }),
      tx.almacenEspacio.findFirst({ where: { id: espacioId, cuentaId }, select: { id: true } }),
    ])
    if (!mat) throw new Error('Material no encontrado')
    if (!esp) throw new Error('Almacén no encontrado')

    const c = await celda(tx, materialId, espacioId)
    let nuevoDisponible = c.disponible
    switch (tipo) {
      case 'entrada':
      case 'devolucion':
        nuevoDisponible += cantidad
        break
      case 'salida':
      case 'rotura':
        if (c.disponible < cantidad) throw new Error('No hay suficiente disponible en ese almacén')
        nuevoDisponible -= cantidad
        break
      case 'ajuste':
        nuevoDisponible += cantidad
        if (nuevoDisponible < 0) throw new Error('El ajuste dejaría el stock en negativo')
        break
    }
    await setCelda(tx, cuentaId, materialId, espacioId, nuevoDisponible, c.enTransito)

    const esOrigen = tipo === 'salida' || tipo === 'rotura'
    await tx.almacenMovimiento.create({
      data: {
        cuentaId,
        materialId,
        tipo,
        cantidad,
        espacioOrigenId: esOrigen ? espacioId : null,
        espacioDestinoId: esOrigen ? null : espacioId,
        motivo,
        realizadoPor: actor,
      },
    })
    await recomputarTotales(tx, materialId)
  })
}

export interface TransferenciaInput {
  materialId: string
  cantidad: number
  espacioOrigenId: string
  espacioDestinoId: string
  notas?: string
}

/** Crea un traspaso: reserva el stock en origen (en tránsito) y lo deja pendiente de recibir. */
export async function crearTransferencia(cuentaId: string, actor: string, input: TransferenciaInput) {
  const cantidad = Math.trunc(input.cantidad)
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor que 0')
  if (input.espacioOrigenId === input.espacioDestinoId) throw new Error('Origen y destino deben ser distintos')

  return prisma.$transaction(async (tx) => {
    const [mat, oEsp, dEsp] = await Promise.all([
      tx.almacenMaterial.findFirst({ where: { id: input.materialId, cuentaId }, select: { id: true } }),
      tx.almacenEspacio.findFirst({ where: { id: input.espacioOrigenId, cuentaId }, select: { id: true } }),
      tx.almacenEspacio.findFirst({ where: { id: input.espacioDestinoId, cuentaId }, select: { id: true } }),
    ])
    if (!mat) throw new Error('Material no encontrado')
    if (!oEsp || !dEsp) throw new Error('Almacén no encontrado')

    const origen = await celda(tx, input.materialId, input.espacioOrigenId)
    const nuevoOrigen = iniciarTraspaso(origen, cantidad) // valida disponible suficiente
    await setCelda(tx, cuentaId, input.materialId, input.espacioOrigenId, nuevoOrigen.disponible, nuevoOrigen.enTransito)

    const transf = await tx.almacenTransferencia.create({
      data: {
        cuentaId,
        materialId: input.materialId,
        espacioOrigenId: input.espacioOrigenId,
        espacioDestinoId: input.espacioDestinoId,
        cantidad,
        estado: 'pendiente',
        creadoPor: actor,
        notas: input.notas?.trim() || null,
      },
    })
    await tx.almacenMovimiento.create({
      data: {
        cuentaId,
        materialId: input.materialId,
        tipo: 'transferencia',
        cantidad,
        espacioOrigenId: input.espacioOrigenId,
        espacioDestinoId: input.espacioDestinoId,
        transferenciaId: transf.id,
        motivo: 'Salida a tránsito',
        realizadoPor: actor,
      },
    })
    await recomputarTotales(tx, input.materialId)
    return transf
  })
}

/** Confirma la recepción de un traspaso en destino (recibidas OK + rotas en tránsito). */
export async function confirmarTransferencia(
  cuentaId: string,
  actor: string,
  transferenciaId: string,
  recibidas: number,
  rotas: number,
) {
  recibidas = Math.trunc(recibidas)
  rotas = Math.trunc(rotas)
  return prisma.$transaction(async (tx) => {
    const t = await tx.almacenTransferencia.findFirst({ where: { id: transferenciaId, cuentaId } })
    if (!t) throw new Error('Traspaso no encontrado')
    if (t.estado === 'recibida' || t.estado === 'cancelada') throw new Error('El traspaso ya está cerrado')

    const origen = await celda(tx, t.materialId, t.espacioOrigenId)
    const destino = await celda(tx, t.materialId, t.espacioDestinoId)
    const r = confirmarRecepcion(origen, destino, recibidas, rotas) // valida en tránsito

    await setCelda(tx, cuentaId, t.materialId, t.espacioOrigenId, r.origen.disponible, r.origen.enTransito)
    await setCelda(tx, cuentaId, t.materialId, t.espacioDestinoId, r.destino.disponible, r.destino.enTransito)

    if (recibidas > 0) {
      await tx.almacenMovimiento.create({
        data: {
          cuentaId, materialId: t.materialId, tipo: 'transferencia', cantidad: recibidas,
          espacioOrigenId: t.espacioOrigenId, espacioDestinoId: t.espacioDestinoId,
          transferenciaId: t.id, motivo: 'Recepción confirmada', realizadoPor: actor,
        },
      })
    }
    if (rotas > 0) {
      await tx.almacenMovimiento.create({
        data: {
          cuentaId, materialId: t.materialId, tipo: 'rotura', cantidad: rotas,
          espacioOrigenId: t.espacioDestinoId, transferenciaId: t.id,
          motivo: 'Rotura en tránsito', realizadoPor: actor,
        },
      })
    }
    await tx.almacenTransferencia.update({
      where: { id: t.id },
      data: { estado: r.estado, recibidaAt: new Date() },
    })
    await recomputarTotales(tx, t.materialId)
    return { estado: r.estado }
  })
}

/** Cancela un traspaso pendiente (aún sin recibir): devuelve el stock al origen. */
export async function cancelarTransferencia(cuentaId: string, actor: string, transferenciaId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.almacenTransferencia.findFirst({ where: { id: transferenciaId, cuentaId } })
    if (!t) throw new Error('Traspaso no encontrado')
    if (t.estado !== 'pendiente') throw new Error('Solo se pueden cancelar traspasos pendientes')

    const origen = await celda(tx, t.materialId, t.espacioOrigenId)
    if (origen.enTransito < t.cantidad) throw new Error('Inconsistencia de stock en tránsito')
    await setCelda(
      tx, cuentaId, t.materialId, t.espacioOrigenId,
      origen.disponible + t.cantidad, origen.enTransito - t.cantidad,
    )
    await tx.almacenMovimiento.create({
      data: {
        cuentaId, materialId: t.materialId, tipo: 'transferencia', cantidad: t.cantidad,
        espacioDestinoId: t.espacioOrigenId, transferenciaId: t.id,
        motivo: 'Traspaso cancelado', realizadoPor: actor,
      },
    })
    await tx.almacenTransferencia.update({ where: { id: t.id }, data: { estado: 'cancelada' } })
    await recomputarTotales(tx, t.materialId)
  })
}

/** Identidad legible de la oficina para `realizado_por`/`autor`. */
export function actorDeSesion(s: { nombre: string | null; email: string | null }): string {
  return s.nombre?.trim() || s.email?.trim() || 'Oficina'
}
