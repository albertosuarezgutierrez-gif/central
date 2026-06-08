import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

// GET — lista de sesiones con mensajes + último mensaje + unread
export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()

    // Sesiones que tienen al menos un mensaje, con info del último mensaje y no leídos
    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        cs.id::text,
        cs.session_date::text,
        cs.property_name,
        cs.guest_name,
        cs.empresa_id::text,
        l.nombre AS limpiadora_nombre,
        last_msg.texto AS ultimo_texto,
        last_msg.remitente_tipo AS ultimo_remitente,
        last_msg.creado_at AS ultimo_mensaje_at,
        COALESCE(unread.cnt, 0)::int AS unread
      FROM cleaning_sessions cs
      LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
      INNER JOIN LATERAL (
        SELECT texto, remitente_tipo, creado_at
        FROM chat_mensajes
        WHERE sesion_id = cs.id
          AND empresa_id = ${empresa_id}::uuid
        ORDER BY creado_at DESC
        LIMIT 1
      ) last_msg ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM chat_mensajes
        WHERE sesion_id = cs.id
          AND empresa_id = ${empresa_id}::uuid
          AND remitente_tipo = 'limpiadora'
          AND leido = false
      ) unread ON true
      WHERE cs.empresa_id = ${empresa_id}::uuid
      ORDER BY last_msg.creado_at DESC
      LIMIT 50
    `)

    // Nombre empresa
    const emp = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre FROM empresas WHERE id = ${empresa_id}::uuid LIMIT 1
    `)

    return NextResponse.json({
      sesiones,
      empresa_nombre: emp[0]?.nombre || 'Admin'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
