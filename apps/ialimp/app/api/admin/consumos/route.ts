import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

// GET /api/admin/consumos?session_id=xxx  → consumos de una sesión
// GET /api/admin/consumos?producto_id=xxx → historial de un producto
// GET /api/admin/consumos                 → resumen últimas 30 sesiones
export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const session_id = searchParams.get('session_id')
    const producto_id = searchParams.get('producto_id')

    if (session_id) {
      const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT sc.*, ps.nombre as producto_nombre, ps.unidad, ps.categoria
        FROM stock_consumos sc
        JOIN productos_stock ps ON ps.id = sc.producto_id
        WHERE sc.session_id = ${session_id}::uuid AND sc.empresa_id = ${empresa_id}::uuid
        ORDER BY ps.categoria, ps.nombre
      `)
      return NextResponse.json(serialize({ consumos: rows }))
    }

    if (producto_id) {
      const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT sc.*, cs.property_name, cs.session_date, cs.tipo_servicio
        FROM stock_consumos sc
        JOIN cleaning_sessions cs ON cs.id = sc.session_id
        WHERE sc.producto_id = ${producto_id}::uuid AND sc.empresa_id = ${empresa_id}::uuid
        ORDER BY sc.created_at DESC
        LIMIT 50
      `)
      return NextResponse.json(serialize({ historial: rows }))
    }

    // Resumen general: coste por sesión (últimas 30 con consumo)
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        sc.session_id,
        cs.property_name,
        cs.session_date,
        cs.tipo_servicio,
        COUNT(sc.id)        AS num_productos,
        SUM(sc.cantidad)    AS total_cantidad,
        SUM(sc.coste_total) AS coste_total
      FROM stock_consumos sc
      JOIN cleaning_sessions cs ON cs.id = sc.session_id
      WHERE sc.empresa_id = ${empresa_id}::uuid
      GROUP BY sc.session_id, cs.property_name, cs.session_date, cs.tipo_servicio
      ORDER BY cs.session_date DESC
      LIMIT 30
    `)
    return NextResponse.json(serialize({ resumen: rows }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
