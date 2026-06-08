import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const body = await req.json()
    const { id, tipo, pagado } = body

    if (!id) {
      return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    }

    if (tipo === 'factura' || tipo === 'informe') {
      // Marcar factura emitida como cobrada / pendiente (fecha_cobro)
      await prisma.$executeRaw(Prisma.sql`
        UPDATE facturas_clientes
        SET fecha_cobro = ${pagado ? Prisma.sql`CURRENT_DATE` : Prisma.sql`NULL`}
        WHERE id = ${id}::uuid
          AND empresa_id = ${empresa_id}::uuid
      `)
    } else if (tipo === 'gasto') {
      // Marcar apunte de gasto como pagado / pendiente
      await prisma.$executeRaw(Prisma.sql`
        UPDATE documentos_contables
        SET pagado = ${pagado === true},
            fecha_pago = ${pagado ? Prisma.sql`CURRENT_DATE` : Prisma.sql`NULL`}
        WHERE id = ${id}::uuid
          AND empresa_id = ${empresa_id}::uuid
      `)
    } else if (tipo === 'ingreso_manual') {
      // Marcar ingreso manual como cobrado / pendiente
      await prisma.$executeRaw(Prisma.sql`
        UPDATE ingresos_manuales
        SET cobrado = ${pagado === true},
            fecha_cobro = ${pagado ? Prisma.sql`CURRENT_DATE` : Prisma.sql`NULL`}
        WHERE id = ${id}::uuid
          AND empresa_id = ${empresa_id}::uuid
      `)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
