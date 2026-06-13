// Lista de gastos en la bandeja de revisión (revisado = false).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const pendientes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, fecha, proveedor, nif_proveedor, numero_factura, concepto, categoria, propiedad,
        base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total,
        drive_url, carpeta_drive, drive_file_name, confianza, motivo_revision, origen, created_at
      FROM gastos
      WHERE revisado = false
      ORDER BY created_at DESC
      LIMIT 500
    `)
    return NextResponse.json({ pendientes, count: pendientes.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
