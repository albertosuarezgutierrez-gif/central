import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirSesionFacturas } from '@/lib/sivra/facturas/acceso'
import { pdfBorradorDe } from '@/lib/sivra/facturas/servicio'

export const dynamic = 'force-dynamic'

// GET /api/sivra/facturas/<id>/pdf → el PDF GUARDADO de una factura emitida (el mismo que recibió el huésped).
// Un borrador no tiene PDF guardado: se genera al vuelo la VISTA PREVIA (sin número, marca de borrador), la misma que llega por Telegram.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirSesionFacturas()
  if (!g.ok) return g.respuesta
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const f = await prisma.sivraFacturaHuesped.findFirst({ where: { id, cuentaId: g.cuentaId }, select: { pdf: true, numeroCompleto: true, estado: true } })
  if (f && !f.pdf && f.estado === 'borrador') {
    const prev = await pdfBorradorDe(id)
    if (prev) return new NextResponse(new Uint8Array(prev), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="borrador-${id}.pdf"`, 'cache-control': 'private, no-store' } })
  }
  if (!f?.pdf) return NextResponse.json({ error: 'Sin PDF (borrador o no encontrada)' }, { status: 404 })
  return new NextResponse(new Uint8Array(f.pdf), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="factura-${f.numeroCompleto ?? id}.pdf"`, 'cache-control': 'private, no-store' },
  })
}
