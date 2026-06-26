// Capa de I/O de la vertical Transporte: adapta las filas de Prisma a los tipos de dominio de
// @central/module-flota y @central/module-transporte, y compone su lógica pura para el dashboard.
// Todo el filtrado es por `cuentaId` (la cuenta de la sesión) — scope multi-tenant del holding.
import {
  alertasDocumentos,
  rentabilidadVehiculo,
  type Vehiculo,
  type Porte,
  type DocumentoVehiculo,
  type Mantenimiento,
  type Repostaje,
  type EstadoPorte,
} from '@central/module-flota'
import {
  resumenServicios,
  totalIntercompany,
  margenServicio,
  type ServicioTransporte,
  type EstadoServicio,
} from '@central/module-transporte'
import { prisma } from './db'

// ─── Helpers de conversión ─────────────────────────────────────────────────────
type Dec = { toString(): string } | number | null | undefined
const num = (d: Dec): number | null => (d == null ? null : Number(d))
const isoDate = (d: Date | null | undefined): string | null =>
  d == null ? null : d.toISOString().slice(0, 10)
const iso = (d: Date | null | undefined): string | null => (d == null ? null : d.toISOString())

// ─── Adaptadores fila → dominio ────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function aVehiculo(r: any): Vehiculo {
  return {
    id: r.id,
    cuentaId: r.cuentaId,
    nombre: r.nombre,
    matricula: r.matricula ?? '',
    tipo: r.tipo,
    capacidadKg: num(r.capacidadKg),
    capacidadM3: num(r.capacidadM3),
    esPropio: r.esPropio,
    proveedorTransporte: r.proveedorTransporte,
    tarifaKm: num(r.tarifaKm),
    tarifaFija: num(r.tarifaFija),
    activo: r.activo,
  }
}

function aDocumento(r: any): DocumentoVehiculo {
  return {
    id: r.id,
    vehiculoId: r.vehiculoId,
    tipo: r.tipo,
    fechaEmision: isoDate(r.fechaEmision),
    fechaCaducidad: isoDate(r.fechaCaducidad) ?? '',
    importe: num(r.importe),
    documentoUrl: r.documentoUrl,
  }
}

function aPorte(r: any): Porte {
  return {
    id: r.id,
    vehiculoId: r.vehiculoId,
    conductorId: r.conductorId,
    estado: r.estado as EstadoPorte,
    kmEstimados: num(r.kmEstimados),
    kmReales: num(r.kmReales),
    costeEstimado: num(r.costeEstimado),
    costeReal: num(r.costeReal),
    importeFacturado: num(r.importeFacturado),
    horaSalida: iso(r.horaSalida),
    horaLlegada: iso(r.horaLlegada),
    esInterno: r.esInterno,
    sociedadOrigenId: r.sociedadOrigenId,
    sociedadDestinoId: r.sociedadDestinoId,
    parent: r.parentId ? { parentId: r.parentId, parentType: r.parentType ?? '' } : undefined,
  }
}

function aMantenimiento(r: any): Mantenimiento {
  return {
    id: r.id,
    vehiculoId: r.vehiculoId,
    fecha: isoDate(r.fecha) ?? '',
    km: num(r.km),
    tipo: r.tipo,
    coste: num(r.coste) ?? 0,
    taller: r.taller,
    notas: r.notas,
  }
}

function aRepostaje(r: any): Repostaje {
  return {
    id: r.id,
    vehiculoId: r.vehiculoId,
    fecha: isoDate(r.fecha) ?? '',
    km: num(r.km),
    litros: num(r.litros) ?? 0,
    importe: num(r.importe) ?? 0,
  }
}

function aServicio(r: any): ServicioTransporte {
  return {
    id: r.id,
    encargoId: r.encargoId,
    clienteNombre: r.clienteNombre,
    aTerceros: r.aTerceros,
    origen: r.origen,
    destino: r.destino,
    fecha: isoDate(r.fecha) ?? '',
    estado: r.estado as EstadoServicio,
    porteIds: Array.isArray(r.portes) ? r.portes.map((p: any) => p.id) : [],
    importe: num(r.importe),
    descuentoEur: num(r.descuentoEur),
    notas: r.notas,
    sociedadOrigenId: r.sociedadOrigenId,
    sociedadDestinoId: r.sociedadDestinoId,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Consultas ─────────────────────────────────────────────────────────────────
export async function listVehiculos(cuentaId: string): Promise<Vehiculo[]> {
  const rows = await prisma.flotaVehiculo.findMany({ where: { cuentaId }, orderBy: { nombre: 'asc' } })
  return rows.map(aVehiculo)
}

export async function listDocumentos(cuentaId: string): Promise<DocumentoVehiculo[]> {
  const rows = await prisma.flotaDocumento.findMany({ where: { vehiculo: { cuentaId } } })
  return rows.map(aDocumento)
}

export async function listPortes(cuentaId: string): Promise<Porte[]> {
  const rows = await prisma.transportePorte.findMany({ where: { vehiculo: { cuentaId } } })
  return rows.map(aPorte)
}

export async function listServicios(cuentaId: string): Promise<ServicioTransporte[]> {
  const rows = await prisma.transporteServicio.findMany({
    where: { cuentaId },
    orderBy: { fecha: 'desc' },
    include: { portes: { select: { id: true } } },
  })
  return rows.map(aServicio)
}

// ─── Dashboard (composición de la lógica pura) ─────────────────────────────────
export interface DashboardData {
  vehiculos: Vehiculo[]
  alertas: ReturnType<typeof alertasDocumentos>
  rentabilidad: Array<{ vehiculo: Vehiculo; rent: ReturnType<typeof rentabilidadVehiculo> }>
  servicios: ServicioTransporte[]
  resumen: ReturnType<typeof resumenServicios>
  intercompany: number
}

export async function getDashboard(cuentaId: string): Promise<DashboardData> {
  const [vehiculos, documentos, portes, servicios, mantRows, repoRows] = await Promise.all([
    listVehiculos(cuentaId),
    listDocumentos(cuentaId),
    listPortes(cuentaId),
    listServicios(cuentaId),
    prisma.flotaMantenimiento.findMany({ where: { vehiculo: { cuentaId } } }),
    prisma.flotaRepostaje.findMany({ where: { vehiculo: { cuentaId } } }),
  ])

  const mantenimientos = mantRows.map(aMantenimiento)
  const repostajes = repoRows.map(aRepostaje)
  const hoyISO = new Date().toISOString().slice(0, 10)

  const rentabilidad = vehiculos.map((v) => ({
    vehiculo: v,
    rent: rentabilidadVehiculo(
      v,
      portes.filter((p) => p.vehiculoId === v.id),
      mantenimientos.filter((m) => m.vehiculoId === v.id),
      repostajes.filter((r) => r.vehiculoId === v.id),
    ),
  }))

  return {
    vehiculos,
    alertas: alertasDocumentos(documentos, hoyISO),
    rentabilidad,
    servicios,
    resumen: resumenServicios(servicios),
    intercompany: totalIntercompany(servicios),
  }
}

// Margen por servicio (para la tabla de servicios), resolviendo el coste con los portes/vehículos.
export async function margenesDeServicios(cuentaId: string) {
  const [servicios, portes, vehiculos] = await Promise.all([
    listServicios(cuentaId),
    listPortes(cuentaId),
    listVehiculos(cuentaId),
  ])
  return servicios.map((s) => ({ servicio: s, margen: margenServicio(s, portes, vehiculos) }))
}
