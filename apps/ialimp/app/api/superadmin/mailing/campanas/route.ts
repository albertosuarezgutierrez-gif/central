// Campañas del mailing en frío (panel superadmin). En la práctica habrá UNA activa.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'
import { isSuperadmin } from '@/lib/tenant'

// GET: lista de campañas con embudo de métricas.
export async function GET() {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const campanas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT c.*,
        COALESCE(m.enviados, 0)  AS enviados,
        COALESCE(m.abiertos, 0)  AS abiertos,
        COALESCE(m.con_click, 0) AS con_click,
        COALESCE(m.pendientes, 0) AS pendientes,
        COALESCE(m.fallidos, 0)  AS fallidos
      FROM mailing_campanas c
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE estado = 'enviado')::int AS enviados,
          COUNT(*) FILTER (WHERE abierto_at IS NOT NULL)::int AS abiertos,
          COUNT(*) FILTER (WHERE click_at IS NOT NULL)::int AS con_click,
          COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
          COUNT(*) FILTER (WHERE estado = 'fallido')::int AS fallidos
        FROM mailing_envios WHERE campana_id = c.id
      ) m ON true
      ORDER BY c.created_at DESC
    `)
    return NextResponse.json(serialize({ campanas }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST: crear campaña con un paso 1 de presentación por defecto.
export async function POST(req: NextRequest) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const b = await req.json()
    const nombre = String(b?.nombre || '').trim() || 'Campaña de presentación'
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO mailing_campanas (nombre) VALUES (${nombre}) RETURNING id
    `)
    const id = rows[0].id
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO mailing_pasos (campana_id, orden, dias_espera, asunto, cuerpo_html)
      VALUES (${id}::uuid, 1, 0,
        ${'Una idea para {{empresa}}'},
        ${'<p>{{opener}}</p><p>En <strong>IALIMP</strong> ayudamos a empresas de limpieza como {{empresa}} a quitarse el caos de organizar el equipo, las fotos y la facturación — y <strong>nos adaptamos a vuestra forma de trabajar</strong>, no al revés.</p>'})
    `)
    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
