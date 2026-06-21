import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

// GET — lista de hilos con último mensaje y unread
export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const tipo = searchParams.get('tipo')

    const hilos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        h.id::text,
        h.tipo,
        h.titulo,
        h.visibilidad,
        h.creado_por,
        h.creado_at,
        h.ultimo_msg_at,
        h.contexto_id::text,
        h.cliente_id::text,
        h.destinatario_tipo,
        h.destinatario_id::text,
        -- nombre limpiadora destinataria
        ld.nombre AS destinatario_nombre,
        ld.color  AS destinatario_color,
        -- último mensaje
        lm.texto        AS ultimo_texto,
        lm.remitente_tipo AS ultimo_remitente,
        lm.creado_at    AS ultimo_msg_at,
        -- unread
        COALESCE(ur.cnt, 0)::int AS unread,
        -- total mensajes
        COALESCE(tot.cnt, 0)::int AS total_msgs,
        -- contexto extra
        CASE
          WHEN h.tipo = 'sesion'     THEN cs.property_name
          WHEN h.tipo = 'propiedad'  THEN p.nombre
          ELSE NULL
        END AS contexto_nombre,
        CASE
          WHEN h.tipo = 'sesion'     THEN cs.session_date::text
          ELSE NULL
        END AS contexto_fecha,
        c.nombre AS cliente_nombre
      FROM chat_hilos h
      LEFT JOIN LATERAL (
        SELECT texto, remitente_tipo, creado_at
        FROM chat_mensajes
        WHERE hilo_id = h.id
        ORDER BY creado_at DESC LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM chat_mensajes
        WHERE hilo_id = h.id AND leido = false AND remitente_tipo != 'admin'
      ) ur ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM chat_mensajes WHERE hilo_id = h.id
      ) tot ON true
      LEFT JOIN cleaning_sessions cs ON cs.id = h.contexto_id AND h.tipo = 'sesion'
      LEFT JOIN propiedades p        ON p.id  = h.contexto_id AND h.tipo = 'propiedad'
      LEFT JOIN clientes c           ON c.id  = h.cliente_id
      LEFT JOIN limpiadoras ld       ON ld.id = h.destinatario_id
      WHERE h.empresa_id = ${empresa_id}::uuid
        ${tipo ? Prisma.sql`AND h.tipo = ${tipo}` : Prisma.sql``}
      ORDER BY COALESCE(lm.creado_at, h.creado_at) DESC
      LIMIT 100
    `)

    const emp = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre FROM empresas WHERE id = ${empresa_id}::uuid LIMIT 1
    `)

    return NextResponse.json({ hilos, empresa_nombre: emp[0]?.nombre || 'Admin' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — crear nuevo hilo
export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { tipo, titulo, contexto_id, visibilidad, cliente_id, destinatario_tipo, destinatario_id } = await req.json()

    if (!tipo || !titulo?.trim()) {
      return NextResponse.json({ error: 'tipo y titulo requeridos' }, { status: 400 })
    }

    const destTipo  = destinatario_tipo || 'todos'
    const destId    = destTipo === 'persona' && destinatario_id ? destinatario_id : null
    // Mensaje directo → visibilidad siempre equipo_empresa (regla de negocio)
    const visibFinal = destTipo === 'persona' ? 'equipo_empresa' : (visibilidad || 'todos')

    const hilo = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO chat_hilos (empresa_id, tipo, titulo, contexto_id, visibilidad, cliente_id, creado_por, destinatario_tipo, destinatario_id)
      VALUES (
        ${empresa_id}::uuid,
        ${tipo},
        ${titulo.trim()},
        ${contexto_id ? Prisma.sql`${contexto_id}::uuid` : Prisma.sql`NULL`},
        ${visibFinal},
        ${cliente_id ? Prisma.sql`${cliente_id}::uuid` : Prisma.sql`NULL`},
        'admin',
        ${destTipo},
        ${destId ? Prisma.sql`${destId}::uuid` : Prisma.sql`NULL`}
      )
      RETURNING id::text, tipo, titulo, visibilidad, destinatario_tipo, destinatario_id::text, creado_at
    `)

    return NextResponse.json({ ok: true, hilo: hilo[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

