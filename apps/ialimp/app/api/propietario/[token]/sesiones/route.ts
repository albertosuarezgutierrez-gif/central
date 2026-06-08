
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, nombre FROM clientes WHERE access_token = ${token} LIMIT 1
    `)
    if (!cliente.length) return NextResponse.json({ error: 'Token inválido' }, { status: 404 })

    const { searchParams } = new URL(req.url)
    const desde = searchParams.get('desde') || (() => {
      const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().split('T')[0]
    })()
    const hasta = searchParams.get('hasta') || '2099-12-31'

    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        cs.id::text,
        cs.session_date::text,
        cs.property_name,
        p.nombre                        AS propiedad_nombre,
        p.direccion                     AS direccion,
        cs.started_at,
        cs.completed_at,
        cs.hora_checkout::text          AS hora_checkout,
        cs.hora_checkin_siguiente::text AS hora_checkin_siguiente,
        l.nombre                        AS limpiadora_nombre,
        cs.num_huespedes,
        cs.incidencias,
        cs.propiedad_id::text,
        CASE
          WHEN cs.completed_at IS NOT NULL THEN 'completada'
          WHEN cs.started_at   IS NOT NULL THEN 'en_curso'
          ELSE 'pendiente'
        END AS estado
      FROM cleaning_sessions cs
      LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
      LEFT JOIN propiedades p ON p.id = cs.propiedad_id
      WHERE cs.cliente_id = ${cliente[0].id}::uuid
        AND cs.session_date BETWEEN ${desde}::date AND ${hasta}::date
      ORDER BY cs.session_date ASC, cs.hora_checkout NULLS LAST
    `)

    return NextResponse.json({ sesiones, cliente: cliente[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — el propietario crea una limpieza (servicio) directamente desde su portal
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, empresa_id::text, nombre FROM clientes WHERE access_token = ${token} LIMIT 1
    `)
    if (!cliente.length) return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
    const { id: cliente_id, empresa_id, nombre } = cliente[0]

    const {
      propiedad_id, session_date, tipo_servicio, notas,
      hora_checkout, hora_checkin_siguiente, num_huespedes,
    } = await req.json()

    if (!propiedad_id) return NextResponse.json({ error: 'La propiedad es obligatoria' }, { status: 400 })
    if (!session_date) return NextResponse.json({ error: 'La fecha es obligatoria' }, { status: 400 })

    // La propiedad debe pertenecer a este propietario
    const prop = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre FROM propiedades
      WHERE id = ${propiedad_id}::uuid AND cliente_id = ${cliente_id}::uuid AND activa = true LIMIT 1
    `)
    if (!prop.length) return NextResponse.json({ error: 'Propiedad no válida' }, { status: 403 })
    const propNombre = prop[0].nombre

    // Calcular ventana de limpieza si se indican ambas horas
    let ventana_minutos: number | null = null
    let alerta_ventana = false
    if (hora_checkout && hora_checkin_siguiente) {
      const [hO, mO] = hora_checkout.split(':').map(Number)
      const [hI, mI] = hora_checkin_siguiente.split(':').map(Number)
      ventana_minutos = (hI * 60 + mI) - (hO * 60 + mO)
      alerta_ventana  = ventana_minutos < 120
    }

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO cleaning_sessions (
        empresa_id, cliente_id, propiedad_id, property_name,
        session_date, tipo_servicio, notas,
        hora_checkout, hora_checkin_siguiente, ventana_minutos, alerta_ventana,
        num_huespedes, origen
      ) VALUES (
        ${empresa_id}::uuid,
        ${cliente_id}::uuid,
        ${propiedad_id}::uuid,
        ${propNombre},
        ${session_date}::date,
        ${tipo_servicio || 'rotacion'},
        ${notas || null},
        ${hora_checkout || null}::time,
        ${hora_checkin_siguiente || null}::time,
        ${ventana_minutos},
        ${alerta_ventana},
        ${num_huespedes ? Number(num_huespedes) : null},
        'propietario'
      )
      RETURNING id::text, session_date::text, property_name
    `)

    // Avisar a la empresa (panel de alertas)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO alertas (empresa_id, tipo, titulo, descripcion, datos)
      VALUES (
        ${empresa_id}::uuid,
        'reserva_propietario',
        ${'🆕 Limpieza solicitada — ' + propNombre},
        ${(nombre || 'El propietario') + ' ha creado una limpieza para el ' + session_date + (tipo_servicio ? ' · ' + tipo_servicio : '')},
        ${JSON.stringify({ sesion_id: result[0]?.id, propiedad_id, session_date, origen: 'propietario' })}::jsonb
      )
    `)

    return NextResponse.json({ ok: true, sesion: result[0] }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
