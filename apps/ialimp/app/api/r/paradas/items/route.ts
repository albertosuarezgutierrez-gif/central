import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

async function getRepartidor() {
  const cookieStore = await cookies()
  const token = cookieStore.get('repartidor_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id::text AS id, r.empresa_id::text AS empresa_id
    FROM repartidor_sessions s
    JOIN repartidores r ON r.id = s.repartidor_id
    WHERE s.token = ${token} AND s.expires_at > now() AND r.activo = true
    LIMIT 1
  `)
  return rows[0] || null
}

// GET — items de una parada
export async function GET(req: Request) {
  const rep = await getRepartidor()
  if (!rep) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const parada_id = new URL(req.url).searchParams.get('parada_id')
  if (!parada_id) return NextResponse.json({ error: 'Falta parada_id' }, { status: 400 })

  // Verificar que la parada es de este repartidor
  const owns = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM repartidor_paradas
    WHERE id = ${parada_id}::uuid AND repartidor_id = ${rep.id}::uuid LIMIT 1
  `)
  if (!owns.length) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const items = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, orden, texto, obligatorio, requiere_foto, completado, completado_at, foto_url
    FROM repartidor_parada_items
    WHERE parada_id = ${parada_id}::uuid
    ORDER BY orden ASC
  `)

  return NextResponse.json({ items })
}

// PATCH — marcar item como completado (con foto opcional)
export async function PATCH(req: Request) {
  const rep = await getRepartidor()
  if (!rep) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { item_id, completado, foto_url } = await req.json()
  if (!item_id) return NextResponse.json({ error: 'Falta item_id' }, { status: 400 })

  // Verificar que el item pertenece a una parada de este repartidor
  const owns = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT pi.id FROM repartidor_parada_items pi
    JOIN repartidor_paradas p ON p.id = pi.parada_id
    WHERE pi.id = ${item_id}::uuid AND p.repartidor_id = ${rep.id}::uuid
    LIMIT 1
  `)
  if (!owns.length) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  await prisma.$executeRaw(Prisma.sql`
    UPDATE repartidor_parada_items SET
      completado    = ${completado ?? true},
      completado_at = CASE WHEN ${completado ?? true} THEN now() ELSE NULL END,
      foto_url      = COALESCE(${foto_url || null}, foto_url)
    WHERE id = ${item_id}::uuid
  `)

  return NextResponse.json({ ok: true })
}
