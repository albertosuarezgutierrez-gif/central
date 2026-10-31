import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { normalizarCompra } from '@/lib/fiscal-compras'
import { listarComprasPrevistas } from '@/lib/fiscal-compras-db'

export const dynamic = 'force-dynamic'

// Compras previstas de la cuenta (todo scoped por cuenta_id).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const compras = await listarComprasPrevistas(session.id)
  if (compras == null) return NextResponse.json({ error: 'No se pudo leer' }, { status: 503 })
  return NextResponse.json({ compras })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const v = normalizarCompra(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    const c = await prisma.fiscalCompraPrevista.create({
      data: {
        cuentaId: session.id, descripcion: v.valor.descripcion, importe: v.valor.importe, propertyId: v.valor.propertyId,
        tipo: v.valor.tipo, fechaPrevista: v.valor.fechaPrevista ? new Date(v.valor.fechaPrevista) : null,
      },
    })
    return NextResponse.json({ id: c.id }, { status: 201 })
  } catch (e) {
    console.error('[compras-previstas POST]', e)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
}
