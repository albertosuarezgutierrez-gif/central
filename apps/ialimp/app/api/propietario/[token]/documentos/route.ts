// app/api/propietario/[token]/documentos/route.ts
// GET: historial de documentos escaneados del propietario

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

async function getCliente(token: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id::text, c.empresa_id::text
    FROM clientes c
    WHERE c.access_token = ${token} AND c.notif_activa = true
    LIMIT 1
  `)
  return rows[0] || null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const mes          = searchParams.get('mes')
    const propiedad_id = searchParams.get('propiedad_id') // null = general (sin propiedad), 'all' = todos

    const docs = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        d.id::text,
        d.tipo_doc, d.proveedor, d.fecha_doc::text, d.numero_doc,
        d.base_imponible::float, d.porcentaje_iva::float, d.cuota_iva::float,
        d.total::float, d.cuenta_gasto, d.categoria,
        d.descripcion, d.notas, d.procesado_stock,
        d.apunte_json, d.lineas_json,
        d.created_at::text,
        d.propiedad_id::text AS propiedad_id,
        p.nombre AS propiedad_nombre
      FROM documentos_contables d
      LEFT JOIN propiedades p ON p.id = d.propiedad_id
      WHERE d.cliente_id = ${cliente.id}::uuid
        AND d.activo = true
        ${mes ? Prisma.sql`AND TO_CHAR(d.fecha_doc, 'YYYY-MM') = ${mes}` : Prisma.sql``}
        ${propiedad_id === 'all' ? Prisma.sql`` :
          propiedad_id ? Prisma.sql`AND d.propiedad_id = ${propiedad_id}::uuid` :
          Prisma.sql`AND d.propiedad_id IS NULL`}
      ORDER BY d.fecha_doc DESC NULLS LAST, d.created_at DESC
      LIMIT 100
    `)

    const total_mes   = docs.reduce((a, d) => a + (d.total || 0), 0)
    const por_tipo    = docs.reduce((acc: any, d) => { acc[d.tipo_doc] = (acc[d.tipo_doc] || 0) + 1; return acc }, {})

    return NextResponse.json(serialize({ docs, total_mes, por_tipo }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
