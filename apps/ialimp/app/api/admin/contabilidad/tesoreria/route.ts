import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()

    // Movimientos de caja realizados (cobros + pagos)
    const movimientos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        ref_id::text AS id,
        COALESCE(fecha_mov, fecha)::text AS fecha,
        CASE WHEN flujo = 'cobro' THEN 'Cobro cliente'
             WHEN origen = 'limpiadora' THEN 'Pago limpiadora'
             ELSE 'Pago proveedor' END AS concepto,
        importe::float AS importe,
        CASE WHEN flujo = 'cobro' THEN 'ingreso' ELSE 'gasto' END AS tipo,
        origen AS descripcion
      FROM v_contab_tesoreria
      WHERE empresa_id = ${empresa_id}::uuid
        AND realizado = true
      ORDER BY COALESCE(fecha_mov, fecha) DESC
      LIMIT 100
    `)

    // Facturas emitidas pendientes de cobro
    const pendientes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        f.id::text,
        f.fecha_emision::text AS fecha,
        CONCAT('Factura ', f.numero_factura, ' — ', COALESCE(c.nombre, f.dest_razon_social)) AS concepto,
        f.total::float AS importe,
        COALESCE(c.nombre, f.dest_razon_social) AS cliente_nombre,
        'factura' AS origen
      FROM facturas_clientes f
      LEFT JOIN clientes c ON c.id = f.cliente_id
      WHERE f.empresa_id = ${empresa_id}::uuid
        AND f.estado NOT IN ('borrador', 'anulada')
        AND f.fecha_cobro IS NULL
        AND f.total > 0
      ORDER BY f.fecha_emision DESC
      LIMIT 50
    `)

    return NextResponse.json({ movimientos, pendientes })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
