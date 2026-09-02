// Capa de I/O de la vertical Alquiler: adapta filas de Prisma a los tipos de @central/module-alquiler
// y compone su lógica pura para el dashboard. Todo filtrado por `cuentaId` (scope del holding).
import {
  resumenAlquileres,
  totalAlquiler,
  totalIntercompany,
  comprometidoEnVentana,
  type Alquiler,
  type LineaAlquiler,
  type EstadoAlquiler,
} from '@central/module-alquiler'
import {
  aMaterialCompartido,
  disponibleTrasComprometido,
  resumenStockUnidades,
  type ResumenStockUnidades,
} from './materiales-compartidos'
import { prisma } from './db'

type Dec = { toString(): string } | number | null | undefined
const num = (d: Dec): number | null => (d == null ? null : Number(d))
const isoDate = (d: Date | null | undefined): string | null =>
  d == null ? null : d.toISOString().slice(0, 10)

/* eslint-disable @typescript-eslint/no-explicit-any */
function aLinea(r: any): LineaAlquiler {
  return {
    materialId: r.materialId,
    nombre: r.nombre,
    cantidad: r.cantidad,
    tarifaDia: num(r.tarifaDia) ?? 0,
    tarifaFija: num(r.tarifaFija),
  }
}

function aAlquiler(r: any): Alquiler {
  return {
    id: r.id,
    encargoId: r.encargoId,
    clienteNombre: r.clienteNombre,
    aTerceros: r.aTerceros,
    fechaInicio: isoDate(r.fechaInicio) ?? '',
    fechaFin: isoDate(r.fechaFin) ?? '',
    estado: r.estado as EstadoAlquiler,
    lineas: Array.isArray(r.lineas) ? r.lineas.map(aLinea) : [],
    fianza: num(r.fianza),
    descuentoEur: num(r.descuentoEur),
    fechaDevolucionReal: isoDate(r.fechaDevolucionReal),
    notas: r.notas,
    sociedadOrigenId: r.sociedadOrigenId,
    sociedadDestinoId: r.sociedadDestinoId,
  }
}

export interface MaterialView {
  id: string
  nombre: string
  categoria: string | null
  stockTotal: number
  tarifaDia: number | null
  fianzaUnit: number | null
  activo: boolean
}
function aMaterial(r: any): MaterialView {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    stockTotal: r.stockTotal,
    tarifaDia: num(r.tarifaDia),
    fianzaUnit: num(r.fianzaUnit),
    activo: r.activo,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listMateriales(cuentaId: string): Promise<MaterialView[]> {
  const rows = await prisma.alquilerMaterial.findMany({ where: { cuentaId }, orderBy: { nombre: 'asc' } })
  return rows.map(aMaterial)
}

export async function listAlquileres(cuentaId: string): Promise<Alquiler[]> {
  const rows = await prisma.alquiler.findMany({
    where: { cuentaId },
    orderBy: { fechaInicio: 'desc' },
    include: { lineas: true },
  })
  return rows.map(aAlquiler)
}

export interface DashboardData {
  materiales: Array<MaterialView & { comprometidoHoy: number; disponibleHoy: number }>
  /** Resumen del catálogo en UNIDADES (@central/module-materiales). Sin valor en €: ver `materiales-compartidos.ts`. */
  stock: ResumenStockUnidades
  alquileres: Alquiler[]
  resumen: ReturnType<typeof resumenAlquileres>
  intercompany: number
  alquileresConTotal: Array<{ alquiler: Alquiler; total: number }>
}

export async function getDashboard(cuentaId: string): Promise<DashboardData> {
  const [materialesRaw, alquileres] = await Promise.all([
    listMateriales(cuentaId),
    listAlquileres(cuentaId),
  ])
  const hoy = new Date().toISOString().slice(0, 10)

  // La aritmética de stock la pone el módulo compartido, no esta app.
  const materiales = materialesRaw.map((m) => {
    const comprometidoHoy = comprometidoEnVentana(alquileres, m.id, hoy, hoy)
    return { ...m, comprometidoHoy, disponibleHoy: disponibleTrasComprometido(m.stockTotal, comprometidoHoy) }
  })

  return {
    materiales,
    stock: resumenStockUnidades(
      materiales.map((m) => aMaterialCompartido(m, cuentaId, m.comprometidoHoy)),
    ),
    alquileres,
    resumen: resumenAlquileres(alquileres),
    intercompany: totalIntercompany(alquileres),
    alquileresConTotal: alquileres.map((a) => ({ alquiler: a, total: totalAlquiler(a) })),
  }
}
