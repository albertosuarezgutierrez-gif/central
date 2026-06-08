import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const { sesion_id, descripcion, guest_phone, rating } = await req.json()
    if (!descripcion?.trim()) return NextResponse.json({ error: 'Descripción obligatoria' }, { status: 400 })

    const clientes = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, empresa_id FROM clientes WHERE access_token = ${token}`)
    if (!clientes.length) return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    const cliente = clientes[0]

    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM cleaning_sessions WHERE id = ${sesion_id}::uuid AND cliente_id = ${cliente.id}::uuid
    `)
    if (!sesiones.length) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    const ses = sesiones[0]

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO quejas (empresa_id, sesion_id, propiedad_id, limpiadora_id, cliente_id, reportada_por, descripcion, guest_phone, categoria, rating)
      VALUES (
        ${cliente.empresa_id}::uuid, ${sesion_id}::uuid,
        ${ses.propiedad_id || null}::uuid,
        ${ses.limpiadora_id || null}::uuid,
        ${cliente.id}::uuid,
        'propietario', ${descripcion.trim()}, ${guest_phone || null}, 'limpieza',
        ${rating ? Number(rating) : null}
      ) RETURNING *
    `)

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO alertas (empresa_id, tipo, titulo, descripcion, datos)
      VALUES (${cliente.empresa_id}::uuid, 'queja_huesped',
        ${'⚠️ Queja huésped — ' + (ses.property_name || 'propiedad')},
        ${descripcion.trim().slice(0, 200)},
        ${JSON.stringify({ sesion_id, queja_id: result[0]?.id, guest_phone: guest_phone||null, limpiadora_id: ses.limpiadora_id })}::jsonb)
    `)

    return NextResponse.json(serialize({ ok: true }))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
