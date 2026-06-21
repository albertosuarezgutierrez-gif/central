import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function getLimpiadora() {
  const jar   = await cookies()
  const token = jar.get('limpiadora_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.limpiadora_id::text AS id, l.empresa_id::text, l.nombre
    FROM limpiadora_sessions s
    JOIN limpiadoras l ON l.id = s.limpiadora_id
    WHERE s.token = ${token}
      AND l.empresa_id IS NOT NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `)
  return rows[0] || null
}

// GET — leer mensajes (sesion_id puede ser null para chat grupal)
export async function GET(req: Request) {
  try {
    const limp = await getLimpiadora()
    if (!limp) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const sesion_id = searchParams.get('sesion_id')

    const mensajes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, remitente_tipo, remitente_nombre, texto,
             creado_at, leido
      FROM chat_mensajes
      WHERE empresa_id = ${limp.empresa_id}::uuid
        ${sesion_id
          ? Prisma.sql`AND sesion_id = ${sesion_id}::uuid`
          : Prisma.sql`AND sesion_id IS NULL`}
      ORDER BY creado_at ASC
      LIMIT 100
    `)

    // Marcar como leídos
    await prisma.$executeRaw(Prisma.sql`
      UPDATE chat_mensajes SET leido = true
      WHERE empresa_id = ${limp.empresa_id}::uuid
        AND remitente_tipo = 'admin'
        AND leido = false
        ${sesion_id
          ? Prisma.sql`AND sesion_id = ${sesion_id}::uuid`
          : Prisma.sql`AND sesion_id IS NULL`}
    `)

    return NextResponse.json({ mensajes })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — enviar mensaje
export async function POST(req: Request) {
  try {
    const limp = await getLimpiadora()
    if (!limp) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { sesion_id, texto } = await req.json()
    if (!texto?.trim()) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO chat_mensajes (empresa_id, sesion_id, remitente_tipo, remitente_nombre, remitente_id, texto)
      VALUES (
        ${limp.empresa_id}::uuid,
        ${sesion_id ? sesion_id : null},
        'limpiadora',
        ${limp.nombre},
        ${limp.id}::uuid,
        ${texto.trim()}
      )
    `)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
