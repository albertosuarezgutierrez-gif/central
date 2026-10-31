import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { normalizarCompra } from '@/lib/fiscal-compras'
import { pisoExiste } from '@/lib/fiscal-compras-db'

export const dynamic = 'force-dynamic'

// Edita (PUT, cuerpo completo) o borra una compra. `cuentaId` en el WHERE: nunca se toca la de otra cuenta.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const v = normalizarCompra(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (!(await pisoExiste(v.valor.propertyId))) return NextResponse.json({ error: 'Piso inválido' }, { status: 400 })
  try {
    const r = await prisma.fiscalCompraPrevista.updateMany({
      where: { id, cuentaId: session.id },
      data: {
        descripcion: v.valor.descripcion, importe: v.valor.importe, propertyId: v.valor.propertyId,
        tipo: v.valor.tipo, fechaPrevista: v.valor.fechaPrevista ? new Date(v.valor.fechaPrevista) : null, updatedAt: new Date(),
      },
    })
    return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No existe' }, { status: 404 })
  } catch (e) {
    console.error('[compras-previstas PUT]', e)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  try {
    const r = await prisma.fiscalCompraPrevista.deleteMany({ where: { id, cuentaId: session.id } })
    return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No existe' }, { status: 404 })
  } catch (e) {
    console.error('[compras-previstas DELETE]', e)
    return NextResponse.json({ error: 'No se pudo borrar' }, { status: 500 })
  }
}
