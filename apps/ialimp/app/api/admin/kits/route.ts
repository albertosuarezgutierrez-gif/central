import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

// GET /api/admin/kits?limpiadora_id=xxx
export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const lid = searchParams.get('limpiadora_id')
    const cond = lid ? Prisma.sql`AND k.limpiadora_id = ${lid}::uuid` : Prisma.sql``

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        k.*,
        ps.nombre    AS producto_nombre,
        ps.unidad    AS producto_unidad,
        ps.categoria AS producto_categoria,
        ps.precio_unitario,
        l.nombre     AS limpiadora_nombre,
        l.color      AS limpiadora_color,
        -- sesiones totales desde la última reposición
        (SELECT COUNT(*)::int FROM cleaning_sessions cs
         WHERE cs.empresa_id = ${empresa_id}::uuid
           AND cs.completed_at IS NOT NULL
           AND cs.completed_at > COALESCE(
             (SELECT MAX(r2.created_at) FROM reposiciones r2 WHERE r2.kit_id = k.id),
             k.created_at
           )
        ) AS sesiones_actuales
      FROM kits_limpiadoras k
      JOIN productos_stock ps ON ps.id = k.producto_id
      JOIN limpiadoras l      ON l.id  = k.limpiadora_id
      WHERE k.empresa_id = ${empresa_id}::uuid
        AND k.activo = true ${cond}
      ORDER BY l.nombre, ps.categoria, ps.nombre
    `)

    // Consumo medio calculado de reposiciones históricas
    const consumo = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM v_consumo_medio_producto
      WHERE empresa_id = ${empresa_id}::uuid
    `)
    const consumoMap: Record<string, any> = {}
    for (const c of consumo) consumoMap[c.producto_id] = c

    const enriched = rows.map(r => ({
      ...r,
      consumo_medio: consumoMap[r.producto_id] || null,
    }))

    return NextResponse.json(serialize({ kits: enriched }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/admin/kits — asignar producto a limpiadora
export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { limpiadora_id, producto_id, cantidad_inicial, notas } = await req.json()
    if (!limpiadora_id || !producto_id) return NextResponse.json({ error: 'limpiadora_id y producto_id requeridos' }, { status: 400 })

    const row = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO kits_limpiadoras (empresa_id, limpiadora_id, producto_id, cantidad_inicial, sesiones_desde_repo, notas)
      VALUES (${empresa_id}::uuid, ${limpiadora_id}::uuid, ${producto_id}::uuid,
              ${Number(cantidad_inicial || 1)}, 0, ${notas || null})
      ON CONFLICT (limpiadora_id, producto_id) WHERE activo = true DO UPDATE
        SET cantidad_inicial = EXCLUDED.cantidad_inicial, notas = EXCLUDED.notas, updated_at = now()
      RETURNING *
    `)
    return NextResponse.json({ ok: true, kit: row[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/admin/kits — eliminar producto del kit
export async function DELETE(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await req.json()
    await prisma.$executeRaw(Prisma.sql`
      UPDATE kits_limpiadoras SET activo = false
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
