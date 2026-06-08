import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    // v_contab_iva agrega por trimestre (no por mes)
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        ('T' || trimestre || ' ' || anio) AS mes,
        ('Trimestre ' || trimestre || ' · ' || anio) AS mes_label,
        iva_repercutido AS repercutido,
        iva_soportado   AS soportado,
        a_liquidar      AS liquidar
      FROM v_contab_iva
      WHERE empresa_id = ${empresa_id}::uuid
        AND anio = ${year}
      ORDER BY trimestre
    `)

    return NextResponse.json({ rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
