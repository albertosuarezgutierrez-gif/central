// Capa de I/O de la vertical Mariscos: adapta filas de Prisma a los tipos de @central/module-pesca
// y compone su lógica pura. Todo filtrado por `cuentaId` (scope del holding).
import {
  stockRestanteKg,
  pesoEnvasadoTotalKg,
  construirEtiqueta,
  type Partida,
  type Envasado,
  type MetodoProduccion,
  type EtiquetaPayload,
} from '@central/module-pesca'
import { prisma } from './db'

type Dec = { toString(): string } | number | null | undefined
const num = (d: Dec): number => (d == null ? 0 : Number(d))
const numN = (d: Dec): number | null => (d == null ? null : Number(d))
const isoDate = (d: Date | null | undefined): string | null =>
  d == null ? null : d.toISOString().slice(0, 10)

/* eslint-disable @typescript-eslint/no-explicit-any */
export function aPartida(r: any): Partida {
  return {
    id: r.id,
    producto: r.producto,
    nombreCientifico: r.nombreCientifico,
    proveedor: r.proveedor,
    loteOrigen: r.loteOrigen,
    albaran: r.albaran,
    marea: r.marea,
    barco: r.barco,
    zonaCaptura: r.zonaCaptura,
    artePesca: r.artePesca,
    metodoProduccion: (r.metodoProduccion as MetodoProduccion) ?? null,
    fechaCaptura: isoDate(r.fechaCaptura),
    fechaRecepcion: isoDate(r.fechaRecepcion) ?? '',
    fechaCaducidad: isoDate(r.fechaCaducidad),
    calibre: r.calibre,
    pesoRecibidoKg: num(r.pesoRecibidoKg),
    precioCompraKg: numN(r.precioCompraKg),
    precioVentaKg: numN(r.precioVentaKg),
    estado: r.estado,
    notas: r.notas,
  }
}

export function aEnvasado(r: any): Envasado {
  return {
    id: r.id,
    partidaId: r.partidaId,
    canal: r.canal,
    pesoKg: num(r.pesoKg),
    precioKg: num(r.precioKg),
    fechaEnvasado: isoDate(r.fechaEnvasado) ?? '',
    fechaCaducidad: isoDate(r.fechaCaducidad),
    cliente: r.cliente,
    codigo: r.codigo,
  }
}

export interface PartidaView extends Partida {
  envasadoKg: number
  restanteKg: number
  nEnvasados: number
}

/** Lista de partidas con su stock ya derivado (para la tabla de /partidas). */
export async function listarPartidas(cuentaId: string): Promise<PartidaView[]> {
  const rows = await prisma.mariscosPartida.findMany({
    where: { cuentaId },
    orderBy: { createdAt: 'desc' },
    include: { envasados: { select: { pesoKg: true } } },
  })
  return rows.map((r) => {
    const p = aPartida(r)
    const envs = r.envasados.map((e) => ({ pesoKg: num(e.pesoKg) }))
    return {
      ...p,
      envasadoKg: pesoEnvasadoTotalKg(envs),
      restanteKg: stockRestanteKg(p, envs),
      nEnvasados: r.envasados.length,
    }
  })
}

/** Una partida con sus envasados (para el detalle). */
export async function getPartida(cuentaId: string, id: string) {
  const r = await prisma.mariscosPartida.findFirst({
    where: { id, cuentaId },
    include: { envasados: { orderBy: { createdAt: 'desc' } } },
  })
  if (!r) return null
  const partida = aPartida(r)
  const envasados = r.envasados.map(aEnvasado)
  return {
    partida,
    envasados,
    restanteKg: stockRestanteKg(partida, envasados),
    envasadoKg: pesoEnvasadoTotalKg(envasados),
  }
}

/** Resuelve la etiqueta de un envasado (con su partida) lista para imprimir. */
export async function getEtiqueta(
  cuentaId: string,
  envasadoId: string,
): Promise<EtiquetaPayload | null> {
  const r = await prisma.mariscosEnvasado.findFirst({
    where: { id: envasadoId, cuentaId },
    include: { partida: true },
  })
  if (!r || !r.partida) return null
  return construirEtiqueta(aPartida(r.partida), aEnvasado(r))
}

export interface EnvasadoView extends Envasado {
  producto: string
}

/** Últimos envasados (para /etiquetas → reimpresión). */
export async function listarEnvasados(cuentaId: string, limit = 100): Promise<EnvasadoView[]> {
  const rows = await prisma.mariscosEnvasado.findMany({
    where: { cuentaId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { partida: { select: { producto: true } } },
  })
  return rows.map((r) => ({ ...aEnvasado(r), producto: r.partida?.producto ?? '—' }))
}

export interface DashboardData {
  partidasEnCamara: number
  kgEnStock: number
  valorStock: number
  envasadosHoy: number
}

/** KPIs del dashboard. */
export async function dashboard(cuentaId: string): Promise<DashboardData> {
  const partidas = await listarPartidas(cuentaId)
  const enCamara = partidas.filter((p) => p.restanteKg > 0)
  const kgEnStock = enCamara.reduce((a, p) => a + p.restanteKg, 0)
  const valorStock = enCamara.reduce((a, p) => a + p.restanteKg * (p.precioVentaKg ?? 0), 0)

  const hoy = new Date().toISOString().slice(0, 10)
  const envasadosHoy = await prisma.mariscosEnvasado.count({
    where: { cuentaId, fechaEnvasado: new Date(hoy) },
  })

  return {
    partidasEnCamara: enCamara.length,
    kgEnStock: Math.round(kgEnStock * 1000) / 1000,
    valorStock: Math.round(valorStock * 100) / 100,
    envasadosHoy,
  }
}
