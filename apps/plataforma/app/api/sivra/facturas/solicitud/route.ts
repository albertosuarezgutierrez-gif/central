import { NextRequest, NextResponse } from 'next/server'
import { exigirSesionFacturas } from '@/lib/sivra/facturas/acceso'
import { asegurarSolicitud, completarSolicitud } from '@/lib/sivra/facturas/servicio'
import { validarReceptor } from '@/lib/sivra/facturas/receptor'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/sivra/facturas/solicitud { reservationId, datos?, total? }
//  · sin `datos`: crea (o reutiliza) la solicitud y devuelve el ENLACE para mandárselo al huésped (p. ej. si pidió la
//    factura por Gmail). No envía nada a nadie.
//  · con `datos`: Alberto rellena él los datos fiscales → borrador + Telegram (igual que si los rellenara el huésped).
//    `total` (opcional) sustituye a amount_gross cuando la fuente no lo trae o no es el importe a facturar.
// Nunca emite: emitir es SOLO el ✅ de Telegram.
export async function POST(req: NextRequest) {
  const g = await exigirSesionFacturas()
  if (!g.ok) return g.respuesta
  const b = await req.json().catch(() => null) as { reservationId?: unknown; datos?: unknown; total?: unknown } | null
  const reservationId = typeof b?.reservationId === 'string' ? b.reservationId.trim().slice(0, 40) : ''
  if (!reservationId) return NextResponse.json({ error: 'Falta la reserva' }, { status: 400 })
  const sol = await asegurarSolicitud(reservationId, 'manual', g.cuentaId)
  if (!sol.ok) return NextResponse.json({ error: sol.motivo }, { status: 404 })
  if (b?.datos === undefined || b?.datos === null) return NextResponse.json({ ok: true, url: sol.url, nueva: sol.nueva })
  const v = validarReceptor(b.datos)
  if (!v.ok) return NextResponse.json({ error: 'Revisa los datos marcados', errores: v.errores }, { status: 422 })
  const total = typeof b.total === 'number' && Number.isFinite(b.total) && b.total > 0 && b.total < 100000 ? b.total : null
  const r = await completarSolicitud({ solicitudId: sol.solicitudId, cuentaId: g.cuentaId }, v.receptor, { totalManual: total })
  if (!r.ok) return NextResponse.json({ error: r.motivo, codigo: r.codigo, url: sol.url }, { status: r.codigo === 'ya_emitida' ? 409 : 422 })
  return NextResponse.json({ ok: true, url: sol.url, facturaId: r.facturaId, propuesta: r.propuesta })
}
