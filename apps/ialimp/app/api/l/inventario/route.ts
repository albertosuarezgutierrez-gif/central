import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'

// Pisos de la empresa (property_id texto) — para acotar inventario sin columna empresa_id.
const propsDeEmpresa = (empresa_id: string) =>
  Prisma.sql`(SELECT DISTINCT property_id FROM cleaning_sessions WHERE empresa_id = ${empresa_id}::uuid)`

export async function GET(req: Request) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const property_id = searchParams.get('property_id')

  const items = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT i.*,
      (SELECT json_agg(a ORDER BY a.created_at DESC)
       FROM inventario_alertas a WHERE a.inventario_id = i.id AND a.resuelta = false
      ) as alertas_pendientes
    FROM inventario i
    WHERE (${property_id}::text IS NULL OR i.property_id = ${property_id})
    AND i.activo = true
    AND i.property_id IN ${propsDeEmpresa(sess.empresa_id)}
    ORDER BY i.categoria, i.articulo
  `)
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { inventario_id, session_id, cantidad_reportada, nota } = await req.json()
  // El inventario debe ser de un piso de la empresa.
  const owns = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM inventario WHERE id = ${inventario_id}::uuid AND property_id IN ${propsDeEmpresa(sess.empresa_id)} LIMIT 1
  `)
  if (!owns.length) return NextResponse.json({ error: 'No válido' }, { status: 403 })
  await prisma.$queryRaw(Prisma.sql`
    INSERT INTO inventario_alertas (inventario_id, session_id, limpiadora_id, cantidad_reportada, nota)
    VALUES (${inventario_id}::uuid, ${session_id || null}::uuid,
            ${sess.limpiadora_id}::uuid, ${cantidad_reportada || 0}, ${nota || null})
  `)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id, stock_actual } = await req.json()
  await prisma.$queryRaw(Prisma.sql`
    UPDATE inventario SET stock_actual = ${stock_actual}
    WHERE id = ${id}::uuid AND property_id IN ${propsDeEmpresa(sess.empresa_id)}
  `)
  await prisma.$queryRaw(Prisma.sql`
    UPDATE inventario_alertas SET resuelta = true WHERE inventario_id = ${id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
