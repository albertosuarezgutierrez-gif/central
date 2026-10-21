import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { dentroDeGeocerca } from '@central/module-geo'
import { resumenJornada } from '@central/module-horario'
import type { TurnoFichaje } from '@central/module-horario'
import type { IncidenciaUbicacion } from '@/lib/ubicacion-fichaje'

export type Fichaje = {
  id: string; empresa_id: string; empleado_id: string; obra_id: string | null
  entrada_at: string; salida_at: string | null
  lat_entrada: number | null; lng_entrada: number | null
  lat_salida: number | null; lng_salida: number | null
  horas_totales: number | null; observaciones: string | null
  estado: 'activo' | 'cerrado'
  // Migración 0024. Precisión en metros; NULL = «no se sabe» (sin ubicación o fichaje anterior).
  sin_ubicacion_entrada?: boolean; sin_ubicacion_salida?: boolean
  precision_entrada_m?: number | null; precision_salida_m?: number | null
  obra_nombre?: string | null
  empleado_nombre?: string | null
}

async function detectarObra(empresaId: string, lat: number | null, lng: number | null): Promise<string | null> {
  if (lat == null || lng == null) return null
  const obras = await prisma.$queryRaw<{ id: string; lat: number; lng: number; radio_m: number }[]>(Prisma.sql`
    SELECT id, lat::float, lng::float, radio_m::float FROM rrhh.obras
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

export type ExtraFichaje = { precision_m?: number | null; sin_ubicacion?: boolean }

export async function ficharEntrada(empresaId: string, empleadoId: string, lat: number | null, lng: number | null, extra: ExtraFichaje = {}): Promise<Fichaje> {
  const obra_id = await detectarObra(empresaId, lat, lng)
  const precision = extra.precision_m ?? null
  const sin = extra.sin_ubicacion === true
  const rows = await prisma.$queryRaw<Fichaje[]>(Prisma.sql`
    INSERT INTO rrhh.fichajes (empresa_id, empleado_id, obra_id, lat_entrada, lng_entrada, precision_entrada_m, sin_ubicacion_entrada)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${obra_id}::uuid, ${lat}::numeric, ${lng}::numeric, ${precision}::int, ${sin})
    RETURNING *`)
  return JSON.parse(JSON.stringify(rows[0]))
}

export async function ficharSalida(empresaId: string, empleadoId: string, lat: number | null, lng: number | null, extra: ExtraFichaje = {}): Promise<Fichaje> {
  const precision = extra.precision_m ?? null
  const sin = extra.sin_ubicacion === true
  const rows = await prisma.$queryRaw<Fichaje[]>(Prisma.sql`
    UPDATE rrhh.fichajes
    SET salida_at = now(), lat_salida = ${lat}::numeric, lng_salida = ${lng}::numeric, estado = 'cerrado',
        precision_salida_m = ${precision}::int, sin_ubicacion_salida = ${sin},
        horas_totales = ROUND(EXTRACT(EPOCH FROM (now() - entrada_at)) / 3600.0, 2)
    WHERE empresa_id = ${empresaId}::uuid AND empleado_id = ${empleadoId}::uuid AND estado = 'activo'
    RETURNING *`)
  if (!rows[0]) throw new Error('No hay fichaje activo')
  const f = JSON.parse(JSON.stringify(rows[0]))
  return { ...f, horas_totales: f.horas_totales != null ? Number(f.horas_totales) : null }
}

/** ¿La empresa deja fichar sin ubicación? Sin fila (o error de lectura del valor) → no. */
export async function permiteFicharSinUbicacion(empresaId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ permite: boolean }[]>(Prisma.sql`
    SELECT permite_fichar_sin_ubicacion AS permite FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  return rows[0]?.permite === true
}

/** Registra una incidencia de ubicación (el GPS del móvil no dio posición). */
export async function registrarIncidenciaUbicacion(empresaId: string, empleadoId: string, i: IncidenciaUbicacion): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO rrhh.incidencias_ubicacion (empresa_id, empleado_id, causa, plataforma, estado_permiso, user_agent)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${i.causa}, ${i.plataforma}, ${i.estado_permiso}, ${i.user_agent})`)
}

/**
 * Enlaza un fichaje SIN ubicación con su incidencia: la última sin enlazar del empleado en los
 * últimos 15 min (la registró el cliente al fallar el GPS). Si no llegó (es best-effort), la crea.
 */
export async function enlazarIncidenciaFichaje(
  empresaId: string, empleadoId: string, fichajeId: string, i: IncidenciaUbicacion,
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    WITH upd AS (
      UPDATE rrhh.incidencias_ubicacion SET fichaje_id = ${fichajeId}::uuid
      WHERE id = (
        SELECT id FROM rrhh.incidencias_ubicacion
        WHERE empresa_id = ${empresaId}::uuid AND empleado_id = ${empleadoId}::uuid
          AND fichaje_id IS NULL AND created_at > now() - interval '15 minutes'
        ORDER BY created_at DESC LIMIT 1)
      RETURNING id)
    INSERT INTO rrhh.incidencias_ubicacion (empresa_id, empleado_id, causa, plataforma, estado_permiso, user_agent, fichaje_id)
    SELECT ${empresaId}::uuid, ${empleadoId}::uuid, ${i.causa}, ${i.plataforma}, ${i.estado_permiso}, ${i.user_agent}, ${fichajeId}::uuid
    WHERE NOT EXISTS (SELECT 1 FROM upd)`)
}

export type ResumenIncidencia = {
  empleado_id: string; empleado_nombre: string | null; causa: string; plataforma: string
  total: number; fichados_sin_ubicacion: number; ultima_at: string
}

/** Incidencias de los últimos 30 días agrupadas por empleado, causa y plataforma (de ESA empresa). */
export async function resumenIncidenciasUbicacion(empresaId: string): Promise<ResumenIncidencia[]> {
  const rows = await prisma.$queryRaw<ResumenIncidencia[]>(Prisma.sql`
    SELECT i.empleado_id, e.nombre AS empleado_nombre, i.causa, i.plataforma,
           COUNT(*)::int AS total, COUNT(i.fichaje_id)::int AS fichados_sin_ubicacion, MAX(i.created_at) AS ultima_at
    FROM rrhh.incidencias_ubicacion i
    LEFT JOIN rrhh.empleados e ON e.id = i.empleado_id AND e.empresa_id = i.empresa_id
    WHERE i.empresa_id = ${empresaId}::uuid AND i.created_at > now() - interval '30 days'
    GROUP BY i.empleado_id, e.nombre, i.causa, i.plataforma
    ORDER BY MAX(i.created_at) DESC`)
  return JSON.parse(JSON.stringify(rows))
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
