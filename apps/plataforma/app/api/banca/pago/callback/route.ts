// Callback del banco tras la autorización SCA (Enable Banking PIS).
// Exento de auth en middleware: el banco redirige aquí sin cookie.
// Marca la factura como pagada si el estado es ACSC; si no, deja que el cron lo reintente.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { estadoPago } from '@/lib/enablebanking'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const facturaId = req.nextUrl.searchParams.get('facturaId') ?? ''
  if (!facturaId) return NextResponse.redirect(new URL('/', req.url))

  const rows = await prisma.$queryRaw<{ pago_id: string | null; telegram_msg_id: number | null }[]>(
    Prisma.sql`SELECT pago_id, telegram_msg_id FROM facturas_proveedor WHERE id = ${facturaId}::uuid LIMIT 1`
  )
  const factura = rows[0]

  if (factura?.pago_id) {
    try {
      const est = await estadoPago(factura.pago_id)
      if (est === 'ACSC') {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE facturas_proveedor
          SET estado = 'pagada', pago_confirmado_at = NOW()
          WHERE id = ${facturaId}::uuid
        `)
      }
    } catch { /* el cron lo reintentará */ }
  }

  // Redirigir a la página de finanzas o de inicio
  return NextResponse.redirect(new URL('/finanzas', req.url))
}
