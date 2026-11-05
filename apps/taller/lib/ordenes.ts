/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// OT: cambios de estado (siempre por `transicionarOt`) y partes de horas del mecánico (abrirParte/cerrarParte).
import {
  abrirParte, cerrarParte, esEstadoOt, margenHoras, minutosRealesOt, transicionarOt, type EstadoOt, type MargenHoras, type ParteHoras,
} from '@central/module-taller'
import { contarAmpliacionesPendientes } from './presupuestos.ts'
import { salirStockOt, type AvisoSalida, type TxStock } from './stock.ts'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a?: any): Promise<any>
  create(a: any): Promise<any>
  update(a: any): Promise<any>
}
export type TxOrdenes = {
  $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<unknown>
  ordenTrabajo: Delegado
  recepcion: Delegado
  presupuesto: Delegado
  parteHoras: Delegado
  otLinea: Delegado
}

/** `avisosStock`: artículos que quedaron en NEGATIVO al cerrar la OT (nunca en silencio: la pantalla los enseña). */
export type ResultadoOrden = { ok: true; estado: EstadoOt; avisosStock?: AvisoSalida[] } | { ok: false; motivo: string }

/** Estados en los que se puede trabajar en el coche (parte de horas). */
export const ESTADOS_TRABAJABLES: readonly EstadoOt[] = ['aceptado', 'en_curso']

const aParte = (p: any): ParteHoras => ({ id: p.id, otId: p.otId, mecanicoId: p.mecanicoId, inicio: p.inicio, fin: p.fin ?? null })

export async function cambiarEstadoOt(
  tx: TxOrdenes, o: { tallerId: string; otId: string; hacia: string; ahora: Date; usuarioId?: string | null },
): Promise<ResultadoOrden> {
  if (!esEstadoOt(o.hacia)) return { ok: false, motivo: 'estado desconocido' }
  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: o.tallerId, id: o.otId } })
  if (!ot) return { ok: false, motivo: 'orden no encontrada' }
  const rec = await tx.recepcion.findFirst({ where: { tallerId: o.tallerId, id: ot.recepcionId } })
  const pres = ot.presupuestoId ? await tx.presupuesto.findFirst({ where: { tallerId: o.tallerId, id: ot.presupuestoId } }) : null
  const partes = (await tx.parteHoras.findMany({ where: { tallerId: o.tallerId, otId: ot.id } })).filter((p) => p.fin == null)
  const r = transicionarOt(ot.estado as EstadoOt, o.hacia, {
    recepcionFirmada: !!rec && rec.firmadoEn != null,
    presupuestoAceptado: !!pres && pres.estado === 'aceptado',
    partesAbiertos: partes.length,
    ampliacionesPendientes: await contarAmpliacionesPendientes(tx as never, { tallerId: o.tallerId, presupuestoPadreId: ot.presupuestoId ?? null, ahora: o.ahora }),
    facturaEmitida: false, // F2: facturas
  })
  if (!r.ok) return r
  await tx.ordenTrabajo.update({
    where: { id: ot.id },
    data: {
      estado: r.estado,
      ...(r.estado === 'terminado' ? { terminadoEn: o.ahora } : {}),
      ...(r.estado === 'entregado' ? { entregadoEn: o.ahora } : {}),
    },
  })
  // El material sale del almacén AL CERRAR la OT (ver lib/stock.ts). Idempotente: reabrir y cerrar solo apunta la diferencia.
  if (r.estado === 'terminado') {
    const s = await salirStockOt(tx as unknown as TxStock, { tallerId: o.tallerId, otId: ot.id, usuarioId: o.usuarioId ?? null })
    return s.avisos.length ? { ...r, avisosStock: s.avisos } : r
  }
  return r
}

export type ResultadoParte = { ok: true; abierto: boolean; cerrados: number } | { ok: false; motivo: string }

/** El mecánico (el de la SESIÓN) abre su parte en una OT. Un parte abierto por mecánico; cambiar de coche cierra el anterior. */
export async function abrirParteMecanico(
  tx: TxOrdenes, o: { tallerId: string; mecanicoId: string; otId: string; ahora: Date },
): Promise<ResultadoParte> {
  // Candado por mecánico: dos toques seguidos no pueden abrir dos partes (además del índice único parcial en BD).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'parte:' + o.tallerId + ':' + o.mecanicoId}))`
  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: o.tallerId, id: o.otId } })
  if (!ot) return { ok: false, motivo: 'orden no encontrada' }
  if (!ESTADOS_TRABAJABLES.includes(ot.estado)) return { ok: false, motivo: `no se trabaja en una orden en estado «${ot.estado}»` }
  const abiertos = (await tx.parteHoras.findMany({ where: { tallerId: o.tallerId, mecanicoId: o.mecanicoId } })).filter((p) => p.fin == null)
  if (abiertos.some((p) => p.otId === o.otId)) return { ok: false, motivo: 'ya tienes un parte abierto en esta orden' }
  const cambio = abrirParte(abiertos.map(aParte), o.mecanicoId, o.otId, o.ahora)
  for (const c of cambio.cerrar) await tx.parteHoras.update({ where: { id: c.id }, data: { fin: c.fin } })
  if (cambio.abrir) {
    await tx.parteHoras.create({
      data: { tallerId: o.tallerId, otId: o.otId, mecanicoId: o.mecanicoId, inicio: cambio.abrir.inicio, fin: null },
    })
  }
  if (ot.estado === 'aceptado') {
    const r = await cambiarEstadoOt(tx, { tallerId: o.tallerId, otId: o.otId, hacia: 'en_curso', ahora: o.ahora })
    if (!r.ok) return { ok: false, motivo: r.motivo }
  }
  return { ok: true, abierto: cambio.abrir !== null, cerrados: cambio.cerrar.length }
}

export async function cerrarParteMecanico(
  tx: TxOrdenes, o: { tallerId: string; mecanicoId: string; ahora: Date },
): Promise<ResultadoParte> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'parte:' + o.tallerId + ':' + o.mecanicoId}))`
  const abiertos = (await tx.parteHoras.findMany({ where: { tallerId: o.tallerId, mecanicoId: o.mecanicoId } })).filter((p) => p.fin == null)
  if (abiertos.length === 0) return { ok: false, motivo: 'no tienes ningún parte abierto' }
  const cerrados = cerrarParte(abiertos.map(aParte), o.mecanicoId, o.ahora)
  for (const c of cerrados) await tx.parteHoras.update({ where: { id: c.id }, data: { fin: c.fin } })
  return { ok: true, abierto: false, cerrados: cerrados.length }
}

/** Baremo (suma de líneas CON baremo) vs minutos reales (partes cerrados) y margen. Falta cualquiera → null, nunca 0. */
export async function horasYMargen(
  tx: Pick<TxOrdenes, 'otLinea' | 'parteHoras'>, o: { tallerId: string; otId: string; precioHoraCent: number },
): Promise<MargenHoras & { partesAbiertos: number }> {
  const lineas = await tx.otLinea.findMany({ where: { tallerId: o.tallerId, otId: o.otId } })
  const conBaremo = lineas.filter((l) => l.baremoMinutos != null)
  const baremo = conBaremo.length === 0 ? null : conBaremo.reduce((s, l) => s + Number(l.baremoMinutos), 0)
  const partes = (await tx.parteHoras.findMany({ where: { tallerId: o.tallerId, otId: o.otId } })).map(aParte)
  const reales = partes.length === 0 ? null : minutosRealesOt(partes, o.otId)
  return { ...margenHoras(baremo, reales, o.precioHoraCent), partesAbiertos: partes.filter((p) => p.fin === null).length }
}
