import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('limpiadora_token')?.value
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const limp = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT l.id FROM limpiadora_sessions s
    JOIN limpiadoras l ON l.id = s.limpiadora_id
    WHERE s.token = ${token} AND s.expires_at > now() AND l.activa = true LIMIT 1
  `)
  if (!limp.length) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const notifs = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, tipo, titulo, cuerpo, leida, created_at,
           propiedad_id::text, cleaning_session_id::text
    FROM campo_notificaciones
    WHERE dest_limpiadora_id = ${limp[0].id}::uuid
    ORDER BY created_at DESC LIMIT 20
  `)

  await prisma.$executeRaw(Prisma.sql`
    UPDATE campo_notificaciones SET leida = true, leida_at = now()
    WHERE dest_limpiadora_id = ${limp[0].id}::uuid AND leida = false
  `)

  return NextResponse.json({ notificaciones: notifs })
}
