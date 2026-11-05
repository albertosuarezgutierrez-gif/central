/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// «Recambios pendientes de aceptar» (hueco que dejó F3): un recambio del catálogo añadido a la OT SIN `aceptada_en` no entra en la
// factura ni sale del stock. Aquí se listan y una persona los acepta DESPUÉS (cuando el cliente dice que sí): queda quién y cuándo.
type Delegado = { findMany(a?: any): Promise<any[]>; findFirst(a?: any): Promise<any>; update(a: any): Promise<any> }
export type TxRecambios = { otLinea: Delegado; ordenTrabajo: Delegado }
export type Resultado = { ok: true } | { ok: false; motivo: string }

const OT_ABIERTAS = ['aceptado', 'en_curso', 'ampliacion_pendiente']
const esPendiente = (l: any) => l.articuloId != null && l.aceptadaEn == null && l.origen === 'manual'

export async function recambiosPendientes(tx: Pick<TxRecambios, 'otLinea'>, tallerId: string, otId: string) {
  const ls = await tx.otLinea.findMany({ where: { tallerId, otId }, orderBy: { creadoEn: 'asc' } })
  return ls.filter(esPendiente).map((l) => ({ id: l.id as string, descripcion: l.descripcion as string, cantidad: Number(l.cantidad), unidad: l.unidad as string, totalCent: Number(l.totalCent) }))
}

export async function aceptarRecambio(tx: TxRecambios, o: { tallerId: string; otId: string; lineaId: string; usuarioId: string; ahora: Date }): Promise<Resultado> {
  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: o.tallerId, id: o.otId } })
  if (!ot) return { ok: false, motivo: 'Orden no encontrada' }
  if (!OT_ABIERTAS.includes(ot.estado)) return { ok: false, motivo: `La orden está «${ot.estado}»: ya no se aceptan recambios` }
  const l = await tx.otLinea.findFirst({ where: { tallerId: o.tallerId, otId: o.otId, id: o.lineaId } })
  if (!l) return { ok: false, motivo: 'Línea no encontrada' }
  if (!esPendiente(l)) return { ok: false, motivo: 'Ese recambio no está pendiente de aceptar' }
  await tx.otLinea.update({ where: { id: l.id }, data: { aceptadaEn: o.ahora, aceptadaPor: o.usuarioId } })
  return { ok: true }
}
