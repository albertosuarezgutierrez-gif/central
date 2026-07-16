// Servicio de inventario por conteo (Fase 3). Al cerrar, las diferencias entre
// lo contado y el sistema generan ajustes (+) o roturas (−) sobre el stock del
// almacén, con su movimiento. Matemática de deltas en @central/module-materiales.
import { prisma } from './db'
import { recomputarTotales, type Tx } from './almacen'
import { ajusteInventario } from '@central/module-materiales'

/** Crea una sesión de inventario y fotografía el stock del sistema en ese almacén. */
export async function crearInventario(
  cuentaId: string,
  input: { espacioId: string; empleadoId?: string | null; ciego?: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const esp = await tx.almacenEspacio.findFirst({ where: { id: input.espacioId, cuentaId, activo: true }, select: { id: true } })
    if (!esp) throw new Error('Almacén no encontrado')
    const inv = await tx.almacenInventario.create({
      data: { cuentaId, espacioId: input.espacioId, empleadoId: input.empleadoId ?? null, ciego: input.ciego ?? true, estado: 'abierto' },
    })
    // Snapshot: una línea por material activo con el disponible actual en ese almacén.
    const materiales = await tx.almacenMaterial.findMany({ where: { cuentaId, activo: true }, select: { id: true } })
    const stock = await tx.almacenStock.findMany({ where: { cuentaId, espacioId: input.espacioId }, select: { materialId: true, disponible: true } })
    const mapa = new Map(stock.map((s) => [s.materialId, s.disponible]))
    if (materiales.length > 0) {
      await tx.almacenInventarioLinea.createMany({
        data: materiales.map((m) => ({ cuentaId, inventarioId: inv.id, materialId: m.id, cantidadSistema: mapa.get(m.id) ?? 0 })),
      })
    }
    return inv
  })
}

/** Guarda el conteo de una línea (y foto opcional de incidencia). */
export async function guardarConteo(
  cuentaId: string,
  input: { lineaId: string; contada: number | null; fotoUrl?: string | null },
) {
  const l = await prisma.almacenInventarioLinea.findFirst({ where: { id: input.lineaId, cuentaId } })
  if (!l) throw new Error('Línea no encontrada')
  const inv = await prisma.almacenInventario.findFirst({ where: { id: l.inventarioId, cuentaId } })
  if (!inv || inv.estado !== 'abierto') throw new Error('El inventario ya está cerrado')
  await prisma.almacenInventarioLinea.update({
    where: { id: input.lineaId },
    data: {
      cantidadContada: input.contada,
      fotoUrl: input.fotoUrl?.trim() || undefined,
    },
  })
}

/** Cierra el inventario: aplica los ajustes/roturas de las diferencias contadas. */
export async function cerrarInventario(cuentaId: string, actor: string, inventarioId: string) {
  return prisma.$transaction(async (tx: Tx) => {
    const inv = await tx.almacenInventario.findFirst({ where: { id: inventarioId, cuentaId } })
    if (!inv) throw new Error('Inventario no encontrado')
    if (inv.estado !== 'abierto') throw new Error('El inventario ya está cerrado')

    const lineas = await tx.almacenInventarioLinea.findMany({
      where: { inventarioId, cuentaId, cantidadContada: { not: null } },
    })
    // Deltas puros (contada != sistema) vía el motor.
    const deltas = ajusteInventario(
      lineas.map((l) => ({
        id: l.id, inventarioId, materialId: l.materialId,
        cantidadSistema: l.cantidadSistema, cantidadContada: l.cantidadContada as number,
        diferencia: (l.cantidadContada as number) - l.cantidadSistema, ajusteGenerado: false,
      })),
    )
    const materiales = new Set<string>()
    for (const d of deltas) {
      const cell = await tx.almacenStock.findUnique({ where: { materialId_espacioId: { materialId: d.materialId, espacioId: inv.espacioId } } })
      const disponible = Math.max(0, (cell?.disponible ?? 0) + d.delta)
      await tx.almacenStock.upsert({
        where: { materialId_espacioId: { materialId: d.materialId, espacioId: inv.espacioId } },
        create: { cuentaId, materialId: d.materialId, espacioId: inv.espacioId, disponible },
        update: { disponible },
      })
      await tx.almacenMovimiento.create({
        data: {
          cuentaId, materialId: d.materialId,
          tipo: d.delta > 0 ? 'ajuste' : 'rotura',
          cantidad: Math.abs(d.delta),
          espacioDestinoId: d.delta > 0 ? inv.espacioId : null,
          espacioOrigenId: d.delta < 0 ? inv.espacioId : null,
          motivo: `Inventario físico (${d.delta > 0 ? 'sobra' : 'falta'})`,
          realizadoPor: actor,
        },
      })
      await tx.almacenInventarioLinea.updateMany({
        where: { inventarioId, materialId: d.materialId }, data: { ajusteGenerado: true },
      })
      materiales.add(d.materialId)
    }
    for (const mId of materiales) await recomputarTotales(tx, mId)
    await tx.almacenInventario.update({
      where: { id: inventarioId }, data: { estado: 'cerrado', cerradoAt: new Date(), cerradoPor: actor },
    })
    return { ajustes: deltas.length }
  })
}
