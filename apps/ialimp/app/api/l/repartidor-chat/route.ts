import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function getLimpiadora() {
  const jar = await cookies()
  const token = jar.get('limpiadora_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.limpiadora_id::text AS id, l.empresa_id::text, l.nombre
    FROM limpiadora_sessions s
    JOIN limpiadoras l ON l.id = s.limpiadora_id
    WHERE s.token = ${token} AND s.expires_at > NOW()
    LIMIT 1
  `)
  return rows[0] || null
}

// GET — leer chat de una parada asignada a esta limpiadora
export async function GET(req: Request) {
  const limp = await getLimpiadora()
  if (!limp) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parada_id = new URL(req.url).searchParams.get('parada_id')
  if (!parada_id) return NextResponse.json({ error: 'Falta parada_id' }, { status: 400 })

  const parada = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM repartidor_paradas
    WHERE id = ${parada_id}::uuid AND limpiadora_id = ${limp.id}::uuid
    LIMIT 1
  `)
  if (!parada.length) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const mensajes = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, from_type, from_nombre, mensaje, leido, created_at
    FROM repartidor_chat
    WHERE parada_id = ${parada_id}::uuid
    ORDER BY created_at ASC
    LIMIT 100
  `)

  await prisma.$executeRaw(Prisma.sql`
    UPDATE repartidor_chat SET leido = true
    WHERE parada_id = ${parada_id}::uuid AND from_type = 'repartidor' AND leido = false
  `)

  return NextResponse.json({ mensajes })
}

// GET paradas de hoy asignadas a esta limpiadora con chat activo
export async function POST(req: Request) {
  const limp = await getLimpiadora()
  if (!limp) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { parada_id, mensaje } = await req.json()
  if (!parada_id || !mensaje?.trim()) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const parada = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, repartidor_id FROM repartidor_paradas
    WHERE id = ${parada_id}::uuid AND limpiadora_id = ${limp.id}::uuid
    LIMIT 1
  `)
  if (!parada.length) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO repartidor_chat (empresa_id, parada_id, from_type, from_id, from_nombre, mensaje)
    VALUES (${limp.empresa_id}::uuid, ${parada_id}::uuid, 'limpiadora', ${limp.id}::uuid, ${limp.nombre}, ${mensaje.trim()})
  `)

  if (parada[0].repartidor_id) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO campo_notificaciones (empresa_id, tipo, titulo, cuerpo, dest_repartidor_id, parada_id)
      VALUES (
        ${limp.empresa_id}::uuid, 'chat_limpiadora',
        ${'💬 ' + limp.nombre + ': ' + mensaje.trim().slice(0, 60)},
        ${mensaje.trim().slice(0, 200)},
        ${parada[0].repartidor_id}::uuid, ${parada_id}::uuid
      )
    `)
  }

  return NextResponse.json({ ok: true })
}
