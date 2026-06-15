import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const TIPOS_SOLICITUD = ['vacaciones', 'permiso_retribuido', 'parte_medico', 'baja', 'otro'] as const
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number]

const ETIQUETAS: Record<TipoSolicitud, string> = {
  vacaciones: 'Vacaciones', permiso_retribuido: 'Permiso retribuido',
  parte_medico: 'Parte médico', baja: 'Baja', otro: 'Otro',
}
export const tipoEtiqueta = (t: string) => (ETIQUETAS as Record<string, string>)[t] ?? t

type EntradaSolicitud = { tipo: string; fecha_inicio?: string | null; fecha_fin?: string | null; motivo?: string | null }

/** Valida y normaliza una solicitud entrante. Lanza Error legible si algo no cuadra. */
export function validarSolicitud(e: EntradaSolicitud) {
  if (!TIPOS_SOLICITUD.includes(e.tipo as TipoSolicitud)) throw new Error('Tipo de solicitud no válido')
  const ini = e.fecha_inicio || null
  const fin = e.fecha_fin || null
  if (ini && fin && fin < ini) throw new Error('La fecha fin no puede ser anterior a la de inicio')
  return { tipo: e.tipo as TipoSolicitud, fecha_inicio: ini, fecha_fin: fin, motivo: (e.motivo ?? '').trim() || null }
}

async function exigeEmpleado(empresaId: string, empleadoId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM rrhh.empleados WHERE id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!rows[0]) throw new Error('Empleado no encontrado')
}

/** El empleado crea una solicitud. */
export async function crearSolicitud(empresaId: string, empleadoId: string, entrada: EntradaSolicitud) {
  await exigeEmpleado(empresaId, empleadoId)
  const v = validarSolicitud(entrada)
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO rrhh.solicitudes (empresa_id, empleado_id, tipo, fecha_inicio, fecha_fin, motivo)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${v.tipo}, ${v.fecha_inicio}::date, ${v.fecha_fin}::date, ${v.motivo})
    RETURNING id, tipo, estado`)
  return rows[0]
}

/** Lista las solicitudes de un empleado (lado empleado). */
export async function misSolicitudes(empresaId: string, empleadoId: string) {
  await exigeEmpleado(empresaId, empleadoId)
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, tipo, fecha_inicio, fecha_fin, motivo, estado, creada_at
    FROM rrhh.solicitudes WHERE empleado_id = ${empleadoId}::uuid ORDER BY creada_at DESC`)
}

/** Lista TODAS las solicitudes de la empresa (lado gestor), con nombre de empleado. */
export async function solicitudesEmpresa(empresaId: string, soloPendientes = false) {
  const filtro = soloPendientes ? Prisma.sql`AND s.estado = 'solicitada'` : Prisma.empty
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.id, s.tipo, s.fecha_inicio, s.fecha_fin, s.motivo, s.estado, s.creada_at,
           e.nombre AS empleado_nombre, s.empleado_id
    FROM rrhh.solicitudes s JOIN rrhh.empleados e ON e.id = s.empleado_id
    WHERE s.empresa_id = ${empresaId}::uuid ${filtro} ORDER BY s.creada_at DESC`)
}

/** El gestor resuelve una solicitud (aprobar/rechazar). */
export async function resolverSolicitud(empresaId: string, usuarioId: string, solicitudId: string, aprobar: boolean) {
  const estado = aprobar ? 'aprobada' : 'rechazada'
  const r = await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.solicitudes SET estado = ${estado}, resuelta_por = ${usuarioId}::uuid, resuelta_at = now()
    WHERE id = ${solicitudId}::uuid AND empresa_id = ${empresaId}::uuid AND estado = 'solicitada'`)
  if (!r) throw new Error('Solicitud no encontrada o ya resuelta')
  return { estado }
}
