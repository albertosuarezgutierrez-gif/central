import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ hilo_id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { hilo_id } = await params

    // Verificar que el hilo pertenece a la empresa
    const hilo = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT h.*,
        CASE WHEN h.tipo='sesion'    THEN cs.property_name
             WHEN h.tipo='propiedad' THEN p.nombre
             ELSE NULL END AS contexto_nombre,
        CASE WHEN h.tipo='sesion' THEN cs.session_date::text ELSE NULL END AS contexto_fecha,
        c.nombre AS cliente_nombre
      FROM chat_hilos h
      LEFT JOIN cleaning_sessions cs ON cs.id = h.contexto_id AND h.tipo = 'sesion'
      LEFT JOIN propiedades p        ON p.id  = h.contexto_id AND h.tipo = 'propiedad'
      LEFT JOIN clientes c           ON c.id  = h.cliente_id
      WHERE h.id = ${hilo_id}::uuid AND h.empresa_id = ${empresa_id}::uuid
    `)
    if (!hilo.length) return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 })

    const mensajes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, remitente_tipo, remitente_nombre, texto, creado_at, leido
      FROM chat_mensajes
      WHERE hilo_id = ${hilo_id}::uuid
      ORDER BY creado_at ASC
      LIMIT 300
    `)

    // Marcar como leídos
    await prisma.$executeRaw(Prisma.sql`
      UPDATE chat_mensajes SET leido = true
      WHERE hilo_id = ${hilo_id}::uuid AND remitente_tipo != 'admin' AND leido = false
    `)

    return NextResponse.json({ hilo: hilo[0], mensajes })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ hilo_id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { hilo_id } = await params
    const { texto } = await req.json()
    if (!texto?.trim()) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })

    // El hilo debe ser de esta empresa.
    const own = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM chat_hilos WHERE id = ${hilo_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
    `)
    if (!own.length) return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 })

    const emp = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre FROM empresas WHERE id = ${empresa_id}::uuid LIMIT 1
    `)

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO chat_mensajes (empresa_id, hilo_id, remitente_tipo, remitente_nombre, texto)
      VALUES (${empresa_id}::uuid, ${hilo_id}::uuid, 'admin', ${emp[0]?.nombre || 'Admin'}, ${texto.trim()})
    `)

    // Actualizar ultimo_msg_at del hilo
    await prisma.$executeRaw(Prisma.sql`
      UPDATE chat_hilos SET ultimo_msg_at = NOW() WHERE id = ${hilo_id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
