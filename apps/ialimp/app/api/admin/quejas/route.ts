import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { serialize } from '@/lib/serialize'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const estado     = searchParams.get('estado')
    const limpiadora = searchParams.get('limpiadora_id')

    const quejas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT q.*, l.nombre AS limpiadora_nombre, p.nombre AS propiedad_nombre,
             c.nombre AS cliente_nombre, cs.session_date
      FROM quejas q
      LEFT JOIN limpiadoras l ON l.id = q.limpiadora_id
      LEFT JOIN propiedades  p ON p.id = q.propiedad_id
      LEFT JOIN clientes     c ON c.id = q.cliente_id
      LEFT JOIN cleaning_sessions cs ON cs.id = q.sesion_id
      WHERE q.empresa_id = ${empresa_id}::uuid
        ${estado     ? Prisma.sql`AND q.estado = ${estado}` : Prisma.sql``}
        ${limpiadora ? Prisma.sql`AND q.limpiadora_id = ${limpiadora}::uuid` : Prisma.sql``}
      ORDER BY q.creada_at DESC LIMIT 100
    `)
    const pendientes = quejas.filter((q: any) => q.estado === 'pendiente').length
    return NextResponse.json(serialize({ quejas, pendientes }))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { sesion_id, descripcion, guest_phone, fotos, categoria = 'limpieza', rating, reportada_por = 'propietario' } = await req.json()
    if (!sesion_id || !descripcion?.trim()) return NextResponse.json({ error: 'Sesión y descripción obligatorias' }, { status: 400 })

    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT cs.*, p.nombre AS prop_nombre FROM cleaning_sessions cs
      LEFT JOIN propiedades p ON p.id = cs.propiedad_id
      WHERE cs.id = ${sesion_id}::uuid AND cs.empresa_id = ${empresa_id}::uuid
    `)
    if (!sesiones.length) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    const ses = sesiones[0]

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO quejas (empresa_id, sesion_id, propiedad_id, limpiadora_id, cliente_id, reportada_por, descripcion, guest_phone, fotos, categoria, rating)
      VALUES (
        ${empresa_id}::uuid, ${sesion_id}::uuid,
        ${ses.propiedad_id || null}::uuid,
        ${ses.limpiadora_id || null}::uuid,
        ${ses.cliente_id || null}::uuid,
        ${reportada_por}, ${descripcion.trim()},
        ${guest_phone || null},
        ${fotos?.length ? JSON.stringify(fotos) : null}::text[],
        ${categoria},
        ${rating ? Number(rating) : null}
      ) RETURNING *
    `)

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO alertas (empresa_id, tipo, titulo, descripcion, datos)
      VALUES (${empresa_id}::uuid, 'queja_huesped',
        ${'⚠️ Queja en ' + (ses.property_name || ses.prop_nombre || 'propiedad')},
        ${descripcion.trim().slice(0, 200)},
        ${JSON.stringify({ sesion_id, queja_id: result[0]?.id, guest_phone: guest_phone||null, limpiadora_id: ses.limpiadora_id })}::jsonb)
    `)

    return NextResponse.json(serialize({ ok: true, queja: result[0] }), { status: 201 })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
