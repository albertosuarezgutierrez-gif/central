import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { serialize } from '@/lib/serialize'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const cliente_id = searchParams.get('cliente_id')

    const propiedades = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        p.*,
        c.nombre  AS cliente_nombre,
        c.tipo    AS cliente_tipo,
        l.nombre  AS limpiadora_nombre,
        COUNT(DISTINCT cs.id) FILTER (WHERE cs.session_date = CURRENT_DATE) AS sesiones_hoy,
        COUNT(DISTINCT cs.id) FILTER (WHERE cs.completed_at IS NOT NULL) AS total_completadas,
        MAX(cs.session_date) FILTER (WHERE cs.completed_at IS NOT NULL) AS ultima_limpieza
      FROM propiedades p
      LEFT JOIN clientes    c  ON c.id  = p.cliente_id
      LEFT JOIN limpiadoras l  ON l.id  = p.limpiadora_principal_id
      LEFT JOIN cleaning_sessions cs ON cs.propiedad_id = p.id
      WHERE p.empresa_id = ${empresa_id}::uuid
        ${cliente_id ? Prisma.sql`AND p.cliente_id = ${cliente_id}::uuid` : Prisma.sql``}
      GROUP BY p.id, c.nombre, c.tipo, l.nombre
      ORDER BY c.nombre NULLS LAST, p.nombre
    `)

    return NextResponse.json(serialize({ propiedades }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const body = await req.json()
    const {
      cliente_id, nombre, tipo = 'piso_turistico', direccion,
      via, numero, piso, puerta,
      codigo_postal, municipio, provincia, referencia_catastral,
      modelo_precio = 'precio_fijo',
      precio_limpieza, duracion_estimada_min = 120,
      hora_checkout_habitual = '11:00', hora_checkin_habitual = '16:00',
      num_camas_135 = 0, num_camas_90 = 0, num_literas = 0,
      num_banos = 1, num_huespedes_max = 2,
      tiene_piscina = false, tiene_terraza = false,
      notas_material, limpiadora_principal_id
    } = body

    if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre obligatorio' }, { status: 400 })

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO propiedades (
        empresa_id, cliente_id, nombre, tipo, direccion,
        via, numero, piso, puerta,
        codigo_postal, municipio, provincia, referencia_catastral,
        modelo_precio, precio_limpieza, duracion_estimada_min,
        hora_checkout_habitual, hora_checkin_habitual,
        num_camas_135, num_camas_90, num_literas, num_banos, num_huespedes_max,
        tiene_piscina, tiene_terraza, notas_material, limpiadora_principal_id, activa
      ) VALUES (
        ${empresa_id}::uuid,
        ${cliente_id ? cliente_id : null}::uuid,
        ${nombre.trim()}, ${tipo}, ${direccion || null},
        ${via || null}, ${numero || null}, ${piso || null}, ${puerta || null},
        ${codigo_postal || null}, ${municipio || null}, ${provincia || null},
        ${referencia_catastral || null},
        ${modelo_precio}, ${precio_limpieza ? Number(precio_limpieza) : null},
        ${Number(duracion_estimada_min)},
        ${hora_checkout_habitual}, ${hora_checkin_habitual},
        ${Number(num_camas_135)}, ${Number(num_camas_90)}, ${Number(num_literas)},
        ${Number(num_banos)}, ${Number(num_huespedes_max)},
        ${Boolean(tiene_piscina)}, ${Boolean(tiene_terraza)},
        ${notas_material || null},
        ${limpiadora_principal_id ? limpiadora_principal_id : null}::uuid,
        true
      )
      RETURNING *
    `)

    return NextResponse.json(serialize({ ok: true, propiedad: result[0] }), { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

