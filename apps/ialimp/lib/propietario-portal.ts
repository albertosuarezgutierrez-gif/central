// Carga de datos del portal del propietario, compartida entre:
//  - app/propietario/[token]/page.tsx  (acceso por enlace/token, legacy)
//  - app/propietario/page.tsx          (acceso por email+contraseña, sesión)
// Mantener una sola fuente para que ambos rendericen exactamente igual.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Cliente + datos de empresa + permisos del chat. Por token de acceso (legacy).
export async function getClienteByToken(token: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.*, e.nombre AS empresa_nombre, e.email AS empresa_email,
           e.marca_nombre, e.logo_url, e.color_primario, e.color_secundario, e.color_light,
           COALESCE(c.chat_config, '{"ver_checklist":false,"ver_fotos":false}'::jsonb) AS chat_config
    FROM clientes c JOIN empresas e ON e.id = c.empresa_id
    WHERE c.access_token = ${token} AND c.notif_activa = true
  `)
  return rows[0] || null
}

// Cliente por id (acceso por sesión: la cookie ya es la autenticación).
export async function getClienteById(id: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.*, e.nombre AS empresa_nombre, e.email AS empresa_email,
           e.marca_nombre, e.logo_url, e.color_primario, e.color_secundario, e.color_light,
           COALESCE(c.chat_config, '{"ver_checklist":false,"ver_fotos":false}'::jsonb) AS chat_config
    FROM clientes c JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = ${id}::uuid
  `)
  return rows[0] || null
}

export function permisosFrom(cliente: any) {
  const cfg = (cliente?.chat_config as any) || {}
  return {
    ver_checklist: cfg.ver_checklist === true,
    ver_fotos:     cfg.ver_fotos     === true,
  }
}

// Propiedades (con estado de hoy) e historial reciente del cliente.
export async function loadPortalData(cliente: any) {
  const propiedades = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      p.id, p.nombre, p.direccion, p.tipo,
      p.hora_checkout_habitual::text AS hora_checkout,
      p.hora_checkin_habitual::text  AS hora_checkin_siguiente,
      p.instrucciones_acceso,
      p.archivos_acceso,
      p.documentos,
      p.tipo_acceso,
      p.codigo_acceso,
      cs_hoy.sesion_id,
      cs_hoy.estado_hoy,
      cs_hoy.hora_completada,
      cs_hoy.limpiadora_nombre,
      cs_hoy.foto_url,
      cs_hoy.firma_at,
      cs_hoy.firma_nombre
    FROM propiedades p
    LEFT JOIN LATERAL (
      SELECT
        cs.id AS sesion_id,
        CASE WHEN cs.completed_at IS NOT NULL THEN 'completada'
             WHEN cs.started_at   IS NOT NULL THEN 'en_curso'
             ELSE 'pendiente' END AS estado_hoy,
        TO_CHAR(cs.completed_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS hora_completada,
        l.nombre AS limpiadora_nombre,
        cs.foto_despues_url AS foto_url,
        cs.firma_at,
        cs.firma_cliente_nombre AS firma_nombre
      FROM cleaning_sessions cs
      LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
      WHERE cs.propiedad_id = p.id AND cs.session_date = CURRENT_DATE
      LIMIT 1
    ) cs_hoy ON true
    WHERE p.cliente_id = ${cliente.id}::uuid AND p.activa = true
    ORDER BY p.nombre ASC
  `)

  const historial = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      cs.id, cs.session_date, cs.property_name,
      TO_CHAR(cs.completed_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS hora_fin,
      cs.foto_despues_url, l.nombre AS limpiadora
    FROM cleaning_sessions cs
    LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
    WHERE cs.cliente_id = ${cliente.id}::uuid AND cs.completed_at IS NOT NULL
    ORDER BY cs.session_date DESC, cs.completed_at DESC
    LIMIT 20
  `)

  return { propiedades, historial, permisos: permisosFrom(cliente) }
}
