import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirSesionFacturas } from '@/lib/sivra/facturas/acceso'
import { proponerEnTelegram } from '@/lib/sivra/facturas/servicio'
import { enviarFactura } from '@/lib/sivra/facturas/emitir'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/sivra/facturas/<id> { accion: 'proponer' | 'reenviar' }
//  · proponer: vuelve a mandar el borrador a Telegram (p. ej. si el aviso estaba silenciado). No emite.
//  · reenviar: reintenta el CORREO de una factura YA emitida y no enviada (nunca vuelve a numerar).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirSesionFacturas()
  if (!g.ok) return g.respuesta
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const f = await prisma.sivraFacturaHuesped.findFirst({ where: { id, cuentaId: g.cuentaId }, select: { estado: true } })
  if (!f) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const b = await req.json().catch(() => ({})) as { accion?: string }
  if (b.accion === 'proponer') {
    if (f.estado !== 'borrador') return NextResponse.json({ error: 'Ya está emitida' }, { status: 409 })
    return NextResponse.json({ ok: true, propuesta: await proponerEnTelegram(id) })
  }
  if (b.accion === 'reenviar') {
    const r = await enviarFactura(id)
    return NextResponse.json({ ok: r.estado === 'enviada' || r.estado === 'ya_enviada', resultado: r }, { status: r.estado === 'fallida' ? 502 : 200 })
  }
  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
