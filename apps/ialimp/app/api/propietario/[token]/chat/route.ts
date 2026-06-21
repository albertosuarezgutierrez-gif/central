import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function getCliente(token: string) {
  const r = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, empresa_id,
           COALESCE(chat_config, '{"default_visible_limpiadora":false,"limpiadora_puede_responder":false}'::jsonb) AS chat_config
    FROM clientes WHERE access_token = ${token} LIMIT 1
  `)
  return r[0] || null
}

// GET — leer mensajes (general o de una sesión concreta)
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const sesion_id = searchParams.get('sesion_id') || null

    const mensajes = sesion_id
      ? await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT * FROM chat_mensajes
          WHERE empresa_id = ${cliente.empresa_id}::uuid AND sesion_id = ${sesion_id}::uuid
          ORDER BY creado_at ASC LIMIT 200
        `)
      : await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT * FROM chat_mensajes
          WHERE empresa_id = ${cliente.empresa_id}::uuid AND sesion_id IS NULL
          ORDER BY creado_at ASC LIMIT 100
        `)

    // Marcar como leídos por el propietario
    if (sesion_id) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE chat_mensajes SET leido_propietario = true
        WHERE empresa_id = ${cliente.empresa_id}::uuid AND sesion_id = ${sesion_id}::uuid
          AND remitente_tipo IN ('admin','limpiadora')
      `)
    } else {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE chat_mensajes SET leido = true
        WHERE empresa_id = ${cliente.empresa_id}::uuid AND sesion_id IS NULL AND remitente_tipo = 'admin'
      `)
    }

    return NextResponse.json({ mensajes, chat_config: cliente.chat_config })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

// POST — enviar mensaje (propietario). Incluye visible_limpiadora por mensaje
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 403 })

    const { texto, sesion_id, visible_limpiadora } = await req.json()
    if (!texto?.trim()) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })

    // visible_limpiadora: usa el valor del mensaje si se pasa, sino default del cliente
    const cfg = cliente.chat_config as any
    const visLimpiadora = typeof visible_limpiadora === 'boolean'
      ? visible_limpiadora
      : (cfg?.default_visible_limpiadora ?? false)

    if (sesion_id) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO chat_mensajes (empresa_id, sesion_id, remitente_tipo, remitente_nombre, texto, visible_limpiadora)
        VALUES (${cliente.empresa_id}::uuid, ${sesion_id}::uuid, 'propietario', ${cliente.nombre}, ${texto.trim()}, ${visLimpiadora})
      `)
    } else {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO chat_mensajes (empresa_id, sesion_id, remitente_tipo, remitente_nombre, texto, visible_limpiadora)
        VALUES (${cliente.empresa_id}::uuid, NULL, 'propietario', ${cliente.nombre}, ${texto.trim()}, ${visLimpiadora})
      `)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

// PATCH — actualizar chat_config del cliente
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 403 })

    const body = await req.json()
    const allowed = ['default_visible_limpiadora', 'limpiadora_puede_responder']
    const patch: Record<string,any> = {}
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') patch[key] = body[key]
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE clientes
      SET chat_config = chat_config || ${JSON.stringify(patch)}::jsonb
      WHERE id = ${cliente.id}::uuid
    `)
    return NextResponse.json({ ok: true, patch })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
