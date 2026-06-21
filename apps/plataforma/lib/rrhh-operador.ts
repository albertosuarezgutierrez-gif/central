import { prisma } from './db'
import { Prisma } from '@prisma/client'

export type EmpleadoRrhh = {
  id: string
  nombre: string
  email: string | null
  puesto: string | null
  estado: string
  fecha_alta: string | null
  empresa_id: string
  empresa_nombre: string
}

export type SolicitudRrhh = {
  id: string
  tipo: string
  estado: string
  fecha_inicio: string | null
  fecha_fin: string | null
  motivo: string | null
  creada_at: string
  empleado_nombre: string
  empresa_nombre: string
}

export async function getEmpleadosRrhh(): Promise<EmpleadoRrhh[]> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT e.id::text, e.nombre, e.email, e.puesto, e.estado,
           e.fecha_alta::text, e.empresa_id::text,
           emp.nombre AS empresa_nombre
    FROM rrhh.empleados e
    JOIN rrhh.empresas emp ON emp.id = e.empresa_id
    ORDER BY emp.nombre ASC, e.nombre ASC
  `)
  return JSON.parse(JSON.stringify(rows))
}

export async function getSolicitudesRrhh(): Promise<SolicitudRrhh[]> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.id::text, s.tipo, s.estado,
           s.fecha_inicio::text, s.fecha_fin::text, s.motivo,
           s.creada_at::text,
           e.nombre AS empleado_nombre,
           emp.nombre AS empresa_nombre
    FROM rrhh.solicitudes s
    JOIN rrhh.empleados e ON e.id = s.empleado_id
    JOIN rrhh.empresas emp ON emp.id = s.empresa_id
    ORDER BY s.creada_at DESC
    LIMIT 500
  `)
  return JSON.parse(JSON.stringify(rows))
}
