import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirSesionFacturas } from '@/lib/sivra/facturas/acceso'
import { proponerEnTelegram } from '@/lib/sivra/facturas/servicio'
import { emitirFactura, enviarFactura } from '@/lib/sivra/facturas/emitir'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/sivra/facturas/<id> { accion: 'proponer' | 'reenviar' }
//  · proponer: vuelve a mandar el borrador a Telegram (p. ej. si el aviso estaba silenciado). No emite.
//  · aprobar { confirmado: true, visto }: ✅ Aprobar y enviar DESDE LA PANTALLA (sesión de Alberto = «su botón»). Misma `emitirFactura`
//    (reclamo FOR UPDATE, serie, número correlativo) y `enviarFactura` que el ✅ de Telegram. `visto` = mensaje de Telegram del
//    borrador que Alberto tenía delante: si el borrador cambió desde entonces, `emitirFactura` contesta `obsoleta` y no emite.
//  · reenviar: reintenta el CORREO de una factura YA emitida y no enviada (nunca vuelve a numerar). Si el envío
//    anterior quedó DUDOSO (pudo salir), contesta `dudoso` y solo reenvía con `forzar: true` (confirmación de Alberto).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirSesionFacturas()
  if (!g.ok) return g.respuesta
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const f = await prisma.sivraFacturaHuesped.findFirst({ where: { id, cuentaId: g.cuentaId }, select: { estado: true } })
  if (!f) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const b = await req.json().catch(() => ({})) as { accion?: string; forzar?: unknown }
  if (b.accion === 'proponer') {
    if (f.estado !== 'borrador') return NextResponse.json({ error: 'Ya está emitida' }, { status: 409 })
    return NextResponse.json({ ok: true, propuesta: await proponerEnTelegram(id) })
  }
  if (b.accion === 'aprobar') {
    const b2 = b as { confirmado?: unknown; visto?: unknown }
    if (b2.confirmado !== true) return NextResponse.json({ error: 'Falta la confirmación de Alberto' }, { status: 400 })
    if (f.estado !== 'borrador') return NextResponse.json({ error: 'Ya está emitida' }, { status: 409 })
    const visto = typeof b2.visto === 'string' && /^\d{1,15}$/.test(b2.visto) ? Number(b2.visto) : null
    if (visto === null) return NextResponse.json({ error: 'Este borrador aún no se ha enviado a Telegram (o su aviso está silenciado): pulsa «Reenviar a Telegram» y recarga antes de aprobar.', codigo: 'sin_mensaje' }, { status: 409 })
    const em = await emitirFactura(id, visto)
    if (em.estado === 'no_existe') return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    if (em.estado === 'obsoleta') return NextResponse.json({ error: 'El borrador ha cambiado desde que lo abriste: recarga y revísalo de nuevo.', codigo: 'obsoleta' }, { status: 409 })
    if (em.estado === 'bloqueada') return NextResponse.json({ error: `No se ha emitido: ${em.motivo}`, codigo: 'bloqueada' }, { status: 422 })
    if (em.estado === 'ya_emitida' && em.enviada) return NextResponse.json({ ok: true, emision: em, envio: { estado: 'ya_enviada' } })
    const numero = em.numeroCompleto
    const envio = await enviarFactura(id)
    return NextResponse.json({ ok: envio.estado === 'enviada' || envio.estado === 'ya_enviada', numero, emision: em, envio }, { status: envio.estado === 'fallida' ? 502 : 200 })
  }
  if (b.accion === 'reenviar') {
    // `forzar` = Alberto ha confirmado reenviar un envío DUDOSO (pudo salir ya): solo lo decide él, nunca automático.
    const r = await enviarFactura(id, { forzar: b.forzar === true })
    return NextResponse.json({ ok: r.estado === 'enviada' || r.estado === 'ya_enviada', resultado: r }, { status: r.estado === 'fallida' ? 502 : 200 })
  }
  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
