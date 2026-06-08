// Detalle / edición / borrado de una campaña y su secuencia de pasos.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'
import { isSuperadmin } from '@/lib/tenant'

// GET: campaña + pasos + métricas de embudo.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const { id } = await params
    const campana = (await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM mailing_campanas WHERE id = ${id}::uuid
    `))[0]
    if (!campana) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    const pasos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM mailing_pasos WHERE campana_id = ${id}::uuid ORDER BY orden
    `)
    const metricas = (await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE estado = 'enviado')::int AS enviados,
        COUNT(*) FILTER (WHERE abierto_at IS NOT NULL)::int AS abiertos,
        COUNT(*) FILTER (WHERE click_at IS NOT NULL)::int AS con_click,
        COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'fallido')::int AS fallidos
      FROM mailing_envios WHERE campana_id = ${id}::uuid
    `))[0]
    return NextResponse.json(serialize({ campana, pasos, metricas }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH: editar campaña (nombre, landing_url, max_dia, activa) y/o sus pasos.
// Body: { nombre?, landing_url?, max_dia?, activa?, pasos?: [{orden,dias_espera,asunto,cuerpo_html}] }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const { id } = await params
    const b = await req.json()

    if (typeof b.nombre === 'string')
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_campanas SET nombre = ${b.nombre}, updated_at = now() WHERE id = ${id}::uuid`)
    if (typeof b.landing_url === 'string')
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_campanas SET landing_url = ${b.landing_url}, updated_at = now() WHERE id = ${id}::uuid`)
    if (Number.isFinite(b.max_dia))
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_campanas SET max_dia = ${Math.max(1, Math.floor(b.max_dia))}, updated_at = now() WHERE id = ${id}::uuid`)
    if (typeof b.activa === 'boolean')
      await prisma.$executeRaw(Prisma.sql`
        UPDATE mailing_campanas
        SET activa = ${b.activa}, estado = ${b.activa ? 'activa' : 'pausada'}, updated_at = now()
        WHERE id = ${id}::uuid`)

    // Reemplazar la secuencia de pasos si viene en el body.
    if (Array.isArray(b.pasos)) {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM mailing_pasos WHERE campana_id = ${id}::uuid`)
      let orden = 1
      for (const p of b.pasos) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO mailing_pasos (campana_id, orden, dias_espera, asunto, cuerpo_html)
          VALUES (${id}::uuid, ${orden}, ${Math.max(0, Math.floor(Number(p.dias_espera) || 0))},
                  ${String(p.asunto || '').trim() || 'Sobre tus limpiezas'},
                  ${String(p.cuerpo_html || '').trim() || '<p>{{opener}}</p>'})`)
        orden++
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const { id } = await params
    await prisma.$executeRaw(Prisma.sql`DELETE FROM mailing_campanas WHERE id = ${id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
