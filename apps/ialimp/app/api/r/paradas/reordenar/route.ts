import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

async function getRepartidor() {
  const jar = await cookies()
  const token = jar.get('repartidor_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id, r.empresa_id
    FROM repartidor_sessions s
    JOIN repartidores r ON r.id = s.repartidor_id
    WHERE s.token = ${token} AND s.expires_at > now() AND r.activo = true
    LIMIT 1
  `)
  return rows[0] || null
}

// PATCH — reordenar paradas según array [{id, orden}]
export async function PATCH(req: Request) {
  const rep = await getRepartidor()
  if (!rep) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { orden } = await req.json()
  if (!Array.isArray(orden) || orden.length === 0) {
    return NextResponse.json({ error: 'Falta array orden' }, { status: 400 })
  }

  for (const item of orden) {
    if (!item.id || item.orden == null) continue
    await prisma.$executeRaw(Prisma.sql`
      UPDATE repartidor_paradas
      SET orden = ${item.orden}, updated_at = now()
      WHERE id = ${item.id}::uuid AND repartidor_id = ${rep.id}::uuid AND completada = false
    `)
  }

  return NextResponse.json({ ok: true })
}
