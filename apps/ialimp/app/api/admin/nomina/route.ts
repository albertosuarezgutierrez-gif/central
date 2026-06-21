import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

// GET — nómina por quincena: resumen por limpiadora (tiempo + importe) de los
// partes de trabajo del rango. Es una agregación en vivo de partes_trabajo.
export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    if (!desde || !hasta) return NextResponse.json({ error: 'desde/hasta requeridos' }, { status: 400 })

    const resumen = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT l.id::text AS limpiadora_id, l.nombre, l.color,
             COUNT(p.id)                          AS num_partes,
             COALESCE(SUM(p.cantidad), 0)         AS total_servicios,
             COALESCE(SUM(p.tiempo_min * p.cantidad), 0) AS total_min,
             COALESCE(SUM(p.importe   * p.cantidad), 0) AS total_importe
      FROM limpiadoras l
      LEFT JOIN partes_trabajo p
        ON p.limpiadora_id = l.id
       AND p.empresa_id = ${empresa_id}::uuid
       AND p.fecha BETWEEN ${desde}::date AND ${hasta}::date
      WHERE l.empresa_id = ${empresa_id}::uuid
      GROUP BY l.id, l.nombre, l.color
      HAVING COUNT(p.id) > 0
      ORDER BY total_importe DESC, l.nombre
    `)
    return NextResponse.json(serialize({ desde, hasta, resumen }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
