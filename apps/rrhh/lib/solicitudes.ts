import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { IDS_SOLICITUD, tipoEtiqueta } from '@/lib/solicitudes-tipos'

function parseDiasVacaciones(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const m = v.match(/\d+/); return m ? parseInt(m[0]) : null }
  return null
}

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

/**
 * Resumen de vacaciones de un empleado para un año dado.
 *
 * 🚨 `devengados` es `null` cuando el CONVENIO de la empresa no está cargado.
 * Antes caía a `?? 30`: eso no es un valor por defecto, es inventarse una
 * condición laboral y enseñársela al trabajador como su saldo disponible (si
 * su convenio da 22 días laborables, se le prometían 30). Sin convenio no hay
 * saldo que calcular — hay que decirlo, no rellenarlo.
 */
export async function resumenVacaciones(empresaId: string, empleadoId: string, anio: number) {
  const [empresa] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT convenio_datos FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  const devengados = parseDiasVacaciones(empresa?.convenio_datos?.vacaciones)

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT estado,
           SUM(EXTRACT(DAY FROM (fecha_fin::date - fecha_inicio::date)) + 1)::int AS dias
    FROM rrhh.solicitudes
    WHERE empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid
      AND tipo = 'vacaciones' AND fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL
      AND EXTRACT(YEAR FROM fecha_inicio) = ${anio}
      AND estado IN ('solicitada', 'aprobada')
    GROUP BY estado`)

  const en_tramite = rows.find((r: any) => r.estado === 'solicitada')?.dias ?? 0
  const aprobados  = rows.find((r: any) => r.estado === 'aprobada')?.dias ?? 0
  return {
    devengados,
    aprobados,
    en_tramite,
    // Sin días devengados no hay resta posible: `null` = «no se sabe», nunca 0
    // (un 0 se leería como «no te quedan vacaciones», que es peor todavía).
    pendientes: devengados == null ? null : Math.max(0, devengados - aprobados - en_tramite),
    convenioCargado: devengados != null,
  }
}

/** Saldo de vacaciones de todos los empleados de una empresa (para la vista admin). */
export async function saldoVacacionesEmpleados(empresaId: string, anio: number) {
  const [empresa] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT convenio_datos FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  // Ver `resumenVacaciones`: sin convenio cargado no se inventa un saldo.
  const devengados = parseDiasVacaciones(empresa?.convenio_datos?.vacaciones)

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT empleado_id::text, estado,
           SUM(EXTRACT(DAY FROM (fecha_fin::date - fecha_inicio::date)) + 1)::int AS dias
    FROM rrhh.solicitudes
    WHERE empresa_id = ${empresaId}::uuid
      AND tipo = 'vacaciones' AND fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL
      AND EXTRACT(YEAR FROM fecha_inicio) = ${anio}
      AND estado IN ('solicitada', 'aprobada')
    GROUP BY empleado_id, estado`)

  const map = new Map<string, { aprobados: number; en_tramite: number; pendientes: number | null }>()
  for (const r of rows) {
    const cur = map.get(r.empleado_id) ?? { aprobados: 0, en_tramite: 0, pendientes: null as number | null }
    if (r.estado === 'aprobada') cur.aprobados = r.dias
    if (r.estado === 'solicitada') cur.en_tramite = r.dias
    cur.pendientes = devengados == null ? null : Math.max(0, devengados - cur.aprobados - cur.en_tramite)
    map.set(r.empleado_id, cur)
  }
  return { map, devengados, convenioCargado: devengados != null }
}

/** Ausencias aprobadas de la empresa en un rango de fechas (para el calendario admin). */
export async function ausenciasCalendario(empresaId: string, desde: string, hasta: string) {
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.id, s.tipo, s.fecha_inicio, s.fecha_fin, s.estado, e.nombre AS empleado_nombre
    FROM rrhh.solicitudes s
    JOIN rrhh.empleados e ON e.id = s.empleado_id
    WHERE s.empresa_id = ${empresaId}::uuid
      AND s.estado IN ('aprobada', 'solicitada')
      AND s.fecha_inicio IS NOT NULL AND s.fecha_fin IS NOT NULL
      AND s.fecha_inicio <= ${hasta}::date AND s.fecha_fin >= ${desde}::date
    ORDER BY s.fecha_inicio, e.nombre`)
}

/** El gestor resuelve una solicitud (aprobar/rechazar). Devuelve aviso si hay solapamiento. */
export async function resolverSolicitud(empresaId: string, usuarioId: string, solicitudId: string, aprobar: boolean) {
  const estado = aprobar ? 'aprobada' : 'rechazada'

  // Leer la solicitud antes de actualizar (para solapamiento y notificación)
  const [sol] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.tipo, s.fecha_inicio, s.fecha_fin, s.empleado_id::text,
           e.nombre AS empleado_nombre, e.email AS empleado_email
    FROM rrhh.solicitudes s
    JOIN rrhh.empleados e ON e.id = s.empleado_id
    WHERE s.id = ${solicitudId}::uuid AND s.empresa_id = ${empresaId}::uuid AND s.estado = 'solicitada'
    LIMIT 1`)
  if (!sol) throw new Error('Solicitud no encontrada o ya resuelta')

  const r = await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.solicitudes SET estado = ${estado}, resuelta_por = ${usuarioId}::uuid, resuelta_at = now()
    WHERE id = ${solicitudId}::uuid AND empresa_id = ${empresaId}::uuid AND estado = 'solicitada'`)
  if (!r) throw new Error('Solicitud no encontrada o ya resuelta')

  // Aviso de solapamiento (solo al aprobar vacaciones con fechas)
  let aviso: string | undefined
  if (aprobar && sol.tipo === 'vacaciones' && sol.fecha_inicio && sol.fecha_fin) {
    const [{ n }] = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM rrhh.solicitudes
      WHERE empresa_id = ${empresaId}::uuid AND tipo = 'vacaciones' AND estado = 'aprobada'
        AND fecha_inicio <= ${sol.fecha_fin}::date AND fecha_fin >= ${sol.fecha_inicio}::date
        AND id <> ${solicitudId}::uuid`)
    if (n > 0) aviso = `${n} empleado${n > 1 ? 's' : ''} también de vacaciones en esas fechas`
  }

  return { estado, aviso, empleado_id: sol.empleado_id, empleado_email: sol.empleado_email, tipo: sol.tipo }
}
