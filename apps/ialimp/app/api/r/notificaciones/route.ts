import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('repartidor_token')?.value
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const rep = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id FROM repartidor_sessions s
    JOIN repartidores r ON r.id = s.repartidor_id
    WHERE s.token = ${token} AND s.expires_at > now() AND r.activo = true LIMIT 1
  `)
  if (!rep.length) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const notifs = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, tipo, titulo, cuerpo, leida, created_at,
           propiedad_id::text, cleaning_session_id::text
    FROM campo_notificaciones
    WHERE dest_repartidor_id = ${rep[0].id}::uuid
    ORDER BY created_at DESC LIMIT 20
  `)

  // Marcar como leídas
  await prisma.$executeRaw(Prisma.sql`
    UPDATE campo_notificaciones SET leida = true, leida_at = now()
    WHERE dest_repartidor_id = ${rep[0].id}::uuid AND leida = false
  `)

  return NextResponse.json({ notificaciones: notifs })
}
