import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    // Rentabilidad por propiedad: ingresos = líneas de factura emitida,
    // gastos = apuntes contables (documentos_contables) imputados a cada piso.
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      WITH ing AS (
        SELECT COALESCE(p.nombre, 'General') AS propiedad,
               SUM(COALESCE(fl.importe, fl.cantidad * fl.precio_unitario))::float AS ingresos
        FROM facturas_clientes f
        JOIN factura_clientes_lineas fl ON fl.factura_id = f.id
        LEFT JOIN propiedades p ON p.id = fl.propiedad_id
        WHERE f.empresa_id = ${empresa_id}::uuid
          AND f.estado <> 'borrador'
          AND EXTRACT(YEAR FROM f.fecha_emision) = ${year}
        GROUP BY 1
      ),
      gas AS (
        SELECT COALESCE(p.nombre, 'General') AS propiedad,
               SUM(dc.base_imponible)::float AS gastos
        FROM documentos_contables dc
        LEFT JOIN propiedades p ON p.id = dc.propiedad_id
        WHERE dc.empresa_id = ${empresa_id}::uuid
          AND dc.activo IS TRUE
          AND COALESCE(dc.ambito, 'empresa') = 'empresa'
          AND EXTRACT(YEAR FROM dc.fecha_doc) = ${year}
        GROUP BY 1
      )
      SELECT
        COALESCE(i.propiedad, g.propiedad) AS propiedad,
        COALESCE(i.ingresos, 0) AS ingresos,
        COALESCE(g.gastos, 0) AS gastos,
        (COALESCE(i.ingresos, 0) - COALESCE(g.gastos, 0)) AS beneficio,
        CASE WHEN COALESCE(i.ingresos, 0) > 0
             THEN ROUND(((COALESCE(i.ingresos, 0) - COALESCE(g.gastos, 0)) / i.ingresos * 100)::numeric, 1)
             ELSE 0 END AS margen_pct
      FROM ing i
      FULL OUTER JOIN gas g ON i.propiedad = g.propiedad
      ORDER BY ingresos DESC
    `)

    return NextResponse.json({ rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
