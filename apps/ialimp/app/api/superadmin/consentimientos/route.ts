import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'
import { isSuperadmin } from '@/lib/tenant'

// GET /api/superadmin/consentimientos
// Lista de consentimientos RGPD de TODOS los clientes (cross-empresa).
// Responsable del marketing = IALIMP (Alberto), por eso vive en el panel
// superadmin y no en el panel de empresa de cada cliente.
export async function GET() {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const clientes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        c.id, c.nombre, c.empresa_id,
        e.nombre AS empresa_nombre,
        c.rgpd_aceptado, c.rgpd_version, c.rgpd_aceptado_at,
        c.marketing_aceptado, c.marketing_aceptado_at,
        ct.email AS email, ct.telefono AS telefono
      FROM clientes c
      JOIN empresas e ON e.id = c.empresa_id
      LEFT JOIN LATERAL (
        SELECT email, telefono FROM cliente_contactos
        WHERE cliente_id = c.id AND principal = true
        LIMIT 1
      ) ct ON true
      WHERE c.rgpd_aceptado = true OR c.marketing_aceptado = true
      ORDER BY c.marketing_aceptado DESC, c.marketing_aceptado_at DESC NULLS LAST, c.nombre
    `)

    return NextResponse.json(serialize({ clientes }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
