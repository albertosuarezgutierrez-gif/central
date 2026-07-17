import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { dentroDeGeocerca } from '@central/module-geo'
import { resumenJornada } from '@central/module-horario'
import type { TurnoFichaje } from '@central/module-horario'

export type Fichaje = {
  id: string; empresa_id: string; empleado_id: string; obra_id: string | null
  entrada_at: string; salida_at: string | null
  lat_entrada: number | null; lng_entrada: number | null
  lat_salida: number | null; lng_salida: number | null
  horas_totales: number | null; observaciones: string | null
  estado: 'activo' | 'cerrado'
  obra_nombre?: string | null
  empleado_nombre?: string | null
}

async function detectarObra(empresaId: string, lat: number | null, lng: number | null): Promise<string | null> {
  if (lat == null || lng == null) return null
  const obras = await prisma.$queryRaw<{ id: string; lat: number; lng: number; radio_m: number }[]>(Prisma.sql`
    SELECT id, lat::float, lng::float, radio_m FROM rrhh.obras
    WHERE empresa_id = ${empresaId}::uuid AND activa = true AND lat IS NOT NULL AND lng IS NOT NULL`)
  for (const o of obras) {
    if (dentroDeGeocerca({ lat, lng }, { lat: o.lat, lng: o.lng }, o.radio_m)) return o.id
  }
  return null
}

export async function fichajeActivo(empresaId: string, empleadoId: string): Promise<Fichaje | null> {
  const rows = await prisma.$queryRaw<Fichaje[]>(Prisma.sql`
    SELECT f.*, o.nombre AS obra_nombre
    FROM rrhh.fichajes f LEFT JOIN rrhh.obras o ON o.id = f.obra_id
    WHERE f.empresa_id = ${empresaId}::uuid AND f.empleado_id = ${empleadoId}::uuid AND f.estado = 'activo'
    ORDER BY f.entrada_at DESC LIMIT 1`)
  if (!rows[0]) return null
  const f = JSON.parse(JSON.stringify(rows[0]))
  return { ...f, horas_totales: f.horas_totales != null ? Number(f.horas_totales) : null }
}

export async function ficharEntrada(empresaId: string, empleadoId: string, lat: number | null, lng: number | null): Promise<Fichaje> {
  const obra_id = await detectarObra(empresaId, lat, lng)
  const rows = await prisma.$queryRaw<Fichaje[]>(Prisma.sql`
    INSERT INTO rrhh.fichajes (empresa_id, empleado_id, obra_id, lat_entrada, lng_entrada)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${obra_id}::uuid, ${lat}, ${lng})
    RETURNING *`)
  return JSON.parse(JSON.stringify(rows[0]))
}

export async function ficharSalida(empresaId: string, empleadoId: string, lat: number | null, lng: number | null): Promise<Fichaje> {
  const rows = await prisma.$queryRaw<Fichaje[]>(Prisma.sql`
    UPDATE rrhh.fichajes
    SET salida_at = now(), lat_salida = ${lat}, lng_salida = ${lng}, estado = 'cerrado',
        horas_totales = ROUND(EXTRACT(EPOCH FROM (now() - entrada_at)) / 3600.0, 2)
    WHERE empresa_id = ${empresaId}::uuid AND empleado_id = ${empleadoId}::uuid AND estado = 'activo'
    RETURNING *`)
  if (!rows[0]) throw new Error('No hay fichaje activo')
  const f = JSON.parse(JSON.stringify(rows[0]))
  return { ...f, horas_totales: f.horas_totales != null ? Number(f.horas_totales) : null }
}

export async function listarFichajes(empresaId: string, opts: { mes?: string; empleadoId?: string } = {}): Promise<Fichaje[]> {
  const rows = await prisma.$queryRaw<Fichaje[]>(Prisma.sql`
    SELECT f.*, o.nombre AS obra_nombre, e.nombre AS empleado_nombre
    FROM rrhh.fichajes f
    LEFT JOIN rrhh.obras o ON o.id = f.obra_id
    LEFT JOIN rrhh.empleados e ON e.id = f.empleado_id
    WHERE f.empresa_id = ${empresaId}::uuid
      ${opts.mes ? Prisma.sql`AND TO_CHAR(f.entrada_at, 'YYYY-MM') = ${opts.mes}` : Prisma.empty}
      ${opts.empleadoId ? Prisma.sql`AND f.empleado_id = ${opts.empleadoId}::uuid` : Prisma.empty}
    ORDER BY f.entrada_at DESC`)
  return JSON.parse(JSON.stringify(rows)).map((f: Fichaje) => ({
    ...f,
    horas_totales: f.horas_totales != null ? Number(f.horas_totales) : null,
  }))
}

export async function fichajesMesEmpleado(empresaId: string, empleadoId: string, mes: string): Promise<{ fichajes: Fichaje[]; resumen: ReturnType<typeof resumenJornada> }> {
  const fichajes = await listarFichajes(empresaId, { mes, empleadoId })
  const turnos: TurnoFichaje[] = fichajes
    .filter(f => f.estado === 'cerrado' && f.salida_at)
    .map(f => ({
      camarero_id: f.empleado_id,
      camarero_nombre: f.empleado_nombre ?? '',
      fecha: f.entrada_at.slice(0, 10),
      entrada_at: f.entrada_at,
      salida_at: f.salida_at!,
      horas_totales: f.horas_totales ?? null,
      tipo: 'normal',
    }))
  return { fichajes, resumen: resumenJornada(turnos) }
}
