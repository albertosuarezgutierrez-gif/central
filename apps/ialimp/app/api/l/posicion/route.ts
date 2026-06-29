import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('limpiadora_token')?.value
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT l.id, l.empresa_id
    FROM limpiadora_sessions s
    JOIN limpiadoras l ON l.id = s.limpiadora_id
    WHERE s.token = ${token} AND s.expires_at > now() AND l.activa = true
    LIMIT 1
  `)
  if (!rows.length) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const limp = rows[0]

  const { lat, lng, precision_m, speed_kmh } = await req.json()
  if (!lat || !lng) return NextResponse.json({ error: 'Falta lat/lng' }, { status: 400 })

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO limpiadora_posiciones (limpiadora_id, empresa_id, lat, lng, precision_m, speed_kmh)
    VALUES (${limp.id}::uuid, ${limp.empresa_id}::uuid, ${lat}, ${lng}, ${precision_m || null}, ${speed_kmh || null})
  `)

  // Purgar >48h
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM limpiadora_posiciones
    WHERE limpiadora_id = ${limp.id}::uuid AND recorded_at < now() - interval '48 hours'
  `)

  return NextResponse.json({ ok: true })
}
