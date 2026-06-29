import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

async function getRepartidor() {
  const jar = await cookies()
  const token = jar.get('repartidor_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id, r.empresa_id, r.nombre
    FROM repartidor_sessions s
    JOIN repartidores r ON r.id = s.repartidor_id
    WHERE s.token = ${token} AND s.expires_at > now() AND r.activo = true
    LIMIT 1
  `)
  return rows[0] || null
}

export async function GET(req: Request) {
  const rep = await getRepartidor()
  if (!rep) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const parada_id = new URL(req.url).searchParams.get('parada_id')
  if (!parada_id) return NextResponse.json({ error: 'Falta parada_id' }, { status: 400 })

  const parada = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM repartidor_paradas
    WHERE id = ${parada_id}::uuid AND repartidor_id = ${rep.id}::uuid
    LIMIT 1
  `)
  if (!parada.length) return NextResponse.json({ error: 'Parada no encontrada' }, { status: 404 })

  const mensajes = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, from_type, from_nombre, mensaje, leido, created_at
    FROM repartidor_chat
    WHERE parada_id = ${parada_id}::uuid
    ORDER BY created_at ASC
    LIMIT 100
  `)

  await prisma.$executeRaw(Prisma.sql`
    UPDATE repartidor_chat SET leido = true
    WHERE parada_id = ${parada_id}::uuid AND from_type = 'limpiadora' AND leido = false
  `)

  return NextResponse.json({ mensajes })
}

export async function POST(req: Request) {
  const rep = await getRepartidor()
  if (!rep) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { parada_id, mensaje } = await req.json()
  if (!parada_id || !mensaje?.trim()) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const parada = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, limpiadora_id FROM repartidor_paradas
    WHERE id = ${parada_id}::uuid AND repartidor_id = ${rep.id}::uuid
    LIMIT 1
  `)
  if (!parada.length) return NextResponse.json({ error: 'Parada no encontrada' }, { status: 404 })

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO repartidor_chat (empresa_id, parada_id, from_type, from_id, from_nombre, mensaje)
    VALUES (${rep.empresa_id}::uuid, ${parada_id}::uuid, 'repartidor', ${rep.id}::uuid, ${rep.nombre}, ${mensaje.trim()})
  `)

  if (parada[0].limpiadora_id) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO campo_notificaciones (empresa_id, tipo, titulo, cuerpo, dest_limpiadora_id, parada_id)
      VALUES (
        ${rep.empresa_id}::uuid, 'chat_repartidor',
        ${'💬 ' + rep.nombre + ': ' + mensaje.trim().slice(0, 60)},
        ${mensaje.trim().slice(0, 200)},
        ${parada[0].limpiadora_id}::uuid, ${parada_id}::uuid
      )
    `)
  }

  return NextResponse.json({ ok: true })
}
