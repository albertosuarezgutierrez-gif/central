import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const sesion_id = searchParams.get('sesion_id')

    const mensajes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, remitente_tipo, remitente_nombre, texto, creado_at, leido
      FROM chat_mensajes
      WHERE empresa_id = ${empresa_id}::uuid
        ${sesion_id
          ? Prisma.sql`AND sesion_id = ${sesion_id}::uuid`
          : Prisma.sql`AND sesion_id IS NULL`}
      ORDER BY creado_at ASC
      LIMIT 200
    `)

    // Marcar como leídos (los de limpiadora)
    await prisma.$executeRaw(Prisma.sql`
      UPDATE chat_mensajes SET leido = true
      WHERE empresa_id = ${empresa_id}::uuid
        AND remitente_tipo = 'limpiadora'
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

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { sesion_id, texto } = await req.json()
    if (!texto?.trim()) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })

    const emp = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre FROM empresas WHERE id = ${empresa_id}::uuid LIMIT 1
    `)

    if (sesion_id) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO chat_mensajes (empresa_id, sesion_id, remitente_tipo, remitente_nombre, texto)
        VALUES (${empresa_id}::uuid, ${sesion_id}::uuid, 'admin', ${emp[0]?.nombre || 'Admin'}, ${texto.trim()})
      `)
    } else {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO chat_mensajes (empresa_id, sesion_id, remitente_tipo, remitente_nombre, texto)
        VALUES (${empresa_id}::uuid, NULL, 'admin', ${emp[0]?.nombre || 'Admin'}, ${texto.trim()})
      `)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
