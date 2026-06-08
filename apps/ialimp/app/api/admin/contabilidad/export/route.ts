import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const year = new Date().getFullYear()

    // Import xlsx dynamically to avoid build errors if not installed
    let xlsx: any
    try {
      xlsx = await import('xlsx')
    } catch {
      return NextResponse.json({ error: 'xlsx no instalado. Añade "xlsx" a package.json' }, { status: 500 })
    }

    // Resultado anual
    const resultado = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        TO_CHAR(make_date(anio, mes, 1), 'Mon YYYY') AS Mes,
        ingresos_base AS Ingresos,
        gastos_base AS Gastos,
        (ingresos_base - gastos_base) AS Beneficio
      FROM v_contab_pyg
      WHERE empresa_id = ${empresa_id}::uuid
        AND anio = ${year}
      ORDER BY anio, mes
    `)

    // IVA anual (v_contab_iva agrega por trimestre, no por mes)
    const iva = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        anio AS "Año",
        trimestre AS "Trimestre",
        iva_repercutido AS "IVA repercutido",
        iva_soportado AS "IVA soportado",
        a_liquidar AS "A liquidar"
      FROM v_contab_iva
      WHERE empresa_id = ${empresa_id}::uuid
        AND anio = ${year}
      ORDER BY trimestre
    `)

    // Crear workbook
    const wb = xlsx.utils.book_new()

    const wsRes = xlsx.utils.json_to_sheet(resultado)
    xlsx.utils.book_append_sheet(wb, wsRes, 'Resultado')

    const wsIva = xlsx.utils.json_to_sheet(iva)
    xlsx.utils.book_append_sheet(wb, wsIva, 'IVA')

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="contabilidad-${year}.xlsx"`,
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
