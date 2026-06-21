import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { IDS_SOLICITUD, tipoEtiqueta } from '@/lib/solicitudes-tipos'

// Catálogo de tipos en `@/lib/solicitudes-tipos` (puro, compartido con la UI). Re-exportamos lo
// que ya consumían otros módulos para no romper imports existentes.
export { tipoEtiqueta }
export const TIPOS_SOLICITUD = IDS_SOLICITUD

type EntradaSolicitud = { tipo: string; fecha_inicio?: string | null; fecha_fin?: string | null; motivo?: string | null; justificante_path?: string | null }

/** Valida y normaliza una solicitud entrante. Lanza Error legible si algo no cuadra. */
export function validarSolicitud(e: EntradaSolicitud) {
  if (!IDS_SOLICITUD.includes(e.tipo)) throw new Error('Tipo de solicitud no válido')
  const ini = e.fecha_inicio || null
  const fin = e.fecha_fin || null
  if (ini && fin && fin < ini) throw new Error('La fecha fin no puede ser anterior a la de inicio')
  return { tipo: e.tipo, fecha_inicio: ini, fecha_fin: fin, motivo: (e.motivo ?? '').trim() || null }
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
  const justificante = entrada.justificante_path || null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO rrhh.solicitudes (empresa_id, empleado_id, tipo, fecha_inicio, fecha_fin, motivo, justificante_path)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${v.tipo}, ${v.fecha_inicio}::date, ${v.fecha_fin}::date, ${v.motivo}, ${justificante})
    RETURNING id, tipo, estado`)
  return rows[0]
}

/** Lista las solicitudes de un empleado (lado empleado). `tiene_justificante` sin exponer el path. */
export async function misSolicitudes(empresaId: string, empleadoId: string) {
  await exigeEmpleado(empresaId, empleadoId)
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, tipo, fecha_inicio, fecha_fin, motivo, estado, creada_at,
           (justificante_path IS NOT NULL) AS tiene_justificante
    FROM rrhh.solicitudes WHERE empleado_id = ${empleadoId}::uuid ORDER BY creada_at DESC`)
}

/** Lista TODAS las solicitudes de la empresa (lado gestor), con nombre de empleado. */
export async function solicitudesEmpresa(empresaId: string, soloPendientes = false) {
  const filtro = soloPendientes ? Prisma.sql`AND s.estado = 'solicitada'` : Prisma.empty
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.id, s.tipo, s.fecha_inicio, s.fecha_fin, s.motivo, s.estado, s.creada_at,
           (s.justificante_path IS NOT NULL) AS tiene_justificante,
           e.nombre AS empleado_nombre, s.empleado_id
    FROM rrhh.solicitudes s JOIN rrhh.empleados e ON e.id = s.empleado_id
    WHERE s.empresa_id = ${empresaId}::uuid ${filtro} ORDER BY s.creada_at DESC`)
}

/** Devuelve el path del justificante de una solicitud (scoped por empresa), o null. */
export async function justificanteDeSolicitud(empresaId: string, solicitudId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT justificante_path FROM rrhh.solicitudes
    WHERE id = ${solicitudId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  return rows[0]?.justificante_path ?? null
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
