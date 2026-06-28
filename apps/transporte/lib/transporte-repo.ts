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

// Portes (con sus paradas en orden) de los servicios de la cuenta — para el editor de ruta.
export interface PorteView {
  id: string
  servicioId: string | null
  vehiculoId: string
  estado: string
  kmEstimados: number | null
  costeEstimado: number | null
  importeFacturado: number | null
  esInterno: boolean
  paradas: { orden: number; direccion: string | null; tipo: string; lat: number | null; lng: number | null }[]
}

export async function listPortesDeServicios(cuentaId: string): Promise<PorteView[]> {
  const rows = await prisma.transportePorte.findMany({
    where: { servicio: { cuentaId } },
    include: { paradas: { orderBy: { orden: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return rows.map((r: any) => ({
    id: r.id,
    servicioId: r.servicioId,
    vehiculoId: r.vehiculoId,
    estado: r.estado,
    kmEstimados: num(r.kmEstimados),
    costeEstimado: num(r.costeEstimado),
    importeFacturado: num(r.importeFacturado),
    esInterno: r.esInterno,
    paradas: Array.isArray(r.paradas)
      ? r.paradas.map((p: any) => ({ orden: p.orden, direccion: p.direccion, tipo: p.tipo, lat: num(p.lat), lng: num(p.lng) }))
      : [],
  }))
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ─── GPS / posiciones ──────────────────────────────────────────────────────────
export interface PosicionView {
  vehiculoId: string
  nombre: string
  lat: number
  lng: number
  velocidadKmh: number | null
  capturadoAt: string // ISO
}

// Última posición de cada vehículo de la cuenta (para el mapa del operador).
export async function listPosicionesUltimas(cuentaId: string): Promise<PosicionView[]> {
  const rows = await prisma.flotaPosicion.findMany({
    where: { vehiculo: { cuentaId } },
    orderBy: { capturadoAt: 'desc' },
    include: { vehiculo: { select: { nombre: true } } },
    take: 500,
  })
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const vista = new Map<string, PosicionView>()
  for (const r of rows as any[]) {
    if (vista.has(r.vehiculoId)) continue // rows vienen desc → la primera es la última
    vista.set(r.vehiculoId, {
      vehiculoId: r.vehiculoId,
      nombre: r.vehiculo?.nombre ?? 'Vehículo',
      lat: Number(r.lat),
      lng: Number(r.lng),
      velocidadKmh: num(r.velocidadKmh),
      capturadoAt: (r.capturadoAt as Date).toISOString(),
    })
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return [...vista.values()]
}

// Conductor por su enlace mágico → datos mínimos + sus portes activos (con vehículo y ruta).
export async function getConductorPorToken(token: string) {
  const c = await prisma.flotaConductor.findFirst({ where: { accesoToken: token } })
  if (!c) return null
  const portes = await prisma.transportePorte.findMany({
    where: { conductorId: c.id, estado: { in: ['planificado', 'en_curso'] } },
    include: {
      vehiculo: { select: { id: true, nombre: true } },
      servicio: { select: { id: true, clienteNombre: true, origen: true, destino: true } },
      paradas: { orderBy: { orden: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return { conductor: { id: c.id, nombre: c.nombre, cuentaId: c.cuentaId }, portes }
}

// Seguimiento público de un servicio por su token (vista cliente: camión + ruta).
export async function getSeguimiento(token: string) {
  const servicio = await prisma.transporteServicio.findFirst({
    where: { seguimientoToken: token },
    include: { portes: { include: { paradas: { orderBy: { orden: 'asc' } } } } },
  })
  if (!servicio) return null
  const vehiculoIds = [...new Set(servicio.portes.map((p) => p.vehiculoId))]
  const posiciones = vehiculoIds.length
    ? await listPosicionesPorVehiculos(vehiculoIds)
    : []
  return { servicio, posiciones }
}

async function listPosicionesPorVehiculos(vehiculoIds: string[]): Promise<PosicionView[]> {
  const rows = await prisma.flotaPosicion.findMany({
    where: { vehiculoId: { in: vehiculoIds } },
    orderBy: { capturadoAt: 'desc' },
    include: { vehiculo: { select: { nombre: true } } },
    take: 500,
  })
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const vista = new Map<string, PosicionView>()
  for (const r of rows as any[]) {
    if (vista.has(r.vehiculoId)) continue
    vista.set(r.vehiculoId, {
      vehiculoId: r.vehiculoId,
      nombre: r.vehiculo?.nombre ?? 'Vehículo',
      lat: Number(r.lat),
      lng: Number(r.lng),
      velocidadKmh: num(r.velocidadKmh),
      capturadoAt: (r.capturadoAt as Date).toISOString(),
    })
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return [...vista.values()]
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
