import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

// GET /api/admin/reposiciones?kit_id=xxx&limpiadora_id=xxx&producto_id=xxx
export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const kit_id       = searchParams.get('kit_id')
    const limpiadora_id = searchParams.get('limpiadora_id')
    const producto_id  = searchParams.get('producto_id')

    const cond = kit_id        ? Prisma.sql`AND r.kit_id = ${kit_id}::uuid`
               : limpiadora_id ? Prisma.sql`AND r.limpiadora_id = ${limpiadora_id}::uuid`
               : producto_id   ? Prisma.sql`AND r.producto_id = ${producto_id}::uuid`
               : Prisma.sql``

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT r.*,
        ps.nombre AS producto_nombre, ps.unidad,
        l.nombre  AS limpiadora_nombre
      FROM reposiciones r
      JOIN productos_stock ps ON ps.id = r.producto_id
      JOIN limpiadoras l      ON l.id  = r.limpiadora_id
      WHERE r.empresa_id = ${empresa_id}::uuid ${cond}
      ORDER BY r.created_at DESC
      LIMIT 100
    `)
    return NextResponse.json(serialize({ reposiciones: rows }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/admin/reposiciones — registrar reposición
export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { kit_id, cantidad, notas } = await req.json()
    if (!kit_id || !cantidad) return NextResponse.json({ error: 'kit_id y cantidad requeridos' }, { status: 400 })

    // Obtener datos del kit
    const kits = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT k.*, ps.precio_unitario
      FROM kits_limpiadoras k
      JOIN productos_stock ps ON ps.id = k.producto_id
      WHERE k.id = ${kit_id}::uuid AND k.empresa_id = ${empresa_id}::uuid
      LIMIT 1
    `)
    if (!kits.length) return NextResponse.json({ error: 'Kit no encontrado' }, { status: 404 })
    const kit = kits[0]

    // Contar sesiones completadas desde la última reposición
    const lastRepo = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT MAX(created_at) as ultima FROM reposiciones WHERE kit_id = ${kit_id}::uuid
    `)
    const ultimaFecha = lastRepo[0]?.ultima || kit.created_at

    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM cleaning_sessions
      WHERE empresa_id = ${empresa_id}::uuid
        AND completed_at IS NOT NULL
        AND completed_at > ${ultimaFecha}::timestamptz
    `)
    const sesiones_previas = sesiones[0]?.n || 0

    // Insertar reposición
    const row = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO reposiciones (empresa_id, kit_id, limpiadora_id, producto_id, cantidad, sesiones_previas, coste_unitario, notas)
      VALUES (${empresa_id}::uuid, ${kit_id}::uuid, ${kit.limpiadora_id}::uuid, ${kit.producto_id}::uuid,
              ${Number(cantidad)}, ${sesiones_previas}, ${kit.precio_unitario || null}, ${notas || null})
      RETURNING *
    `)

    // Resetear sesiones_desde_repo en el kit
    await prisma.$executeRaw(Prisma.sql`
      UPDATE kits_limpiadoras
      SET sesiones_desde_repo = 0,
          cantidad_inicial = ${Number(cantidad)},
          nivel_actual = 100,
          updated_at = now()
      WHERE id = ${kit_id}::uuid
    `)

    return NextResponse.json({
      ok: true,
      reposicion: row[0],
      sesiones_previas,
      coste: kit.precio_unitario ? Number(cantidad) * Number(kit.precio_unitario) : null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
