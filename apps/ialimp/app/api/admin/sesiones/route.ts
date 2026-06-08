import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// GET — sesiones por fecha
export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const date  = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const desde = searchParams.get('desde') || date
    const hasta = searchParams.get('hasta') || date

    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        cs.*,
        l.nombre  AS limpiadora_nombre,
        c.nombre  AS cliente_nombre,
        c.tipo    AS cliente_tipo,
        p.nombre  AS propiedad_nombre,
        p.direccion AS propiedad_direccion
      FROM cleaning_sessions cs
      LEFT JOIN limpiadoras l  ON l.id = cs.limpiadora_id
      LEFT JOIN clientes     c ON c.id = cs.cliente_id
      LEFT JOIN propiedades  p ON p.id = cs.propiedad_id
      WHERE cs.empresa_id = ${empresa_id}::uuid
        AND cs.session_date BETWEEN ${desde}::date AND ${hasta}::date
      ORDER BY cs.session_date ASC, cs.hora_inicio ASC NULLS LAST, l.nombre ASC
    `)

    return NextResponse.json({ sesiones })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — crear sesión manual
export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const {
      cliente_id, propiedad_id, property_name,
      session_date, hora_inicio, limpiadora_id,
      tipo_servicio, notas,
      hora_checkout, hora_checkin_siguiente, num_huespedes,
    } = await req.json()

    // Validaciones obligatorias
    if (!cliente_id)   return NextResponse.json({ error: 'El cliente es obligatorio' }, { status: 400 })
    if (!propiedad_id) return NextResponse.json({ error: 'La propiedad es obligatoria' }, { status: 400 })
    if (!session_date) return NextResponse.json({ error: 'La fecha es obligatoria' }, { status: 400 })

    // Verificar cliente pertenece a la empresa
    const checkCliente = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM clientes
      WHERE id = ${cliente_id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    if (!checkCliente.length) return NextResponse.json({ error: 'Cliente no válido' }, { status: 403 })

    // Verificar propiedad pertenece al cliente
    const checkProp = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre FROM propiedades
      WHERE id = ${propiedad_id}::uuid AND cliente_id = ${cliente_id}::uuid
    `)
    if (!checkProp.length) return NextResponse.json({ error: 'Propiedad no válida' }, { status: 403 })

    const propNombre = property_name || checkProp[0].nombre

    // Calcular ventana si se pasan ambas horas
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
        empresa_id, cliente_id, propiedad_id, property_id, property_name,
        session_date, hora_inicio, limpiadora_id, tipo_servicio, notas,
        hora_checkout, hora_checkin_siguiente, ventana_minutos, alerta_ventana,
        num_huespedes, origen
      ) VALUES (
        ${empresa_id}::uuid,
        ${cliente_id}::uuid,
        ${propiedad_id}::uuid,
        ${propiedad_id},
        ${propNombre},
        ${session_date}::date,
        ${hora_inicio || null},
        ${limpiadora_id ? limpiadora_id : null}::uuid,
        ${tipo_servicio || 'rotacion'},
        ${notas || null},
        ${hora_checkout || null}::time,
        ${hora_checkin_siguiente || null}::time,
        ${ventana_minutos},
        ${alerta_ventana},
        ${num_huespedes || null},
        'manual'
      )
      RETURNING *
    `)

    return NextResponse.json({ ok: true, sesion: result[0] }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
