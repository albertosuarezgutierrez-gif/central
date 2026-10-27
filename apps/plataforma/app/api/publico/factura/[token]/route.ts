import { NextRequest, NextResponse } from 'next/server'
import { exigirTokenPublico, SIN_CACHE } from '@/lib/sivra/facturas/acceso-publico'
import { completarSolicitud, vistaPublica } from '@/lib/sivra/facturas/servicio'
import { validarReceptor } from '@/lib/sivra/facturas/receptor'
import { TEXTO_YA_RECIBIDA } from '@/lib/sivra/facturas/enlace'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET  /api/publico/factura/<token> → { piso, desde, hasta, completada, emitida }. NADA más de la reserva.
// POST /api/publico/factura/<token> → datos fiscales del huésped. Se validan AQUÍ (nunca nos fiamos del navegador);
//      con datos válidos se guarda la solicitud, se prepara el borrador y le llega a Alberto por Telegram. No se emite nada.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const g = await exigirTokenPublico(req, token, 'ver', 60, 60 * 60_000)
  if (!g.ok) return g.respuesta
  const v = await vistaPublica(token)
  if (v.estado !== 'ok') return NextResponse.json({ error: 'Enlace no válido' }, { status: 404, headers: SIN_CACHE })
  return NextResponse.json(v, { headers: SIN_CACHE })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const g = await exigirTokenPublico(req, token, 'enviar', 10, 60 * 60_000)
  if (!g.ok) return g.respuesta
  const cuerpo = await req.json().catch(() => null)
  if (!cuerpo || typeof cuerpo !== 'object') return NextResponse.json({ error: 'Datos no válidos' }, { status: 400, headers: SIN_CACHE })
  // Honeypot: un campo que una persona no ve ni rellena.
  if (typeof (cuerpo as Record<string, unknown>).web === 'string' && (cuerpo as Record<string, string>).web.trim()) return NextResponse.json({ ok: true }, { headers: SIN_CACHE })
  const v = validarReceptor(cuerpo)
  if (!v.ok) return NextResponse.json({ error: 'Revisa los datos marcados', errores: v.errores }, { status: 422, headers: SIN_CACHE })
  const r = await completarSolicitud({ token }, v.receptor)
  if (!r.ok) {
    // Sin importe: los datos SÍ quedan guardados; Alberto completa el importe. Al huésped se le da por recibido.
    if (r.codigo === 'sin_importe') return NextResponse.json({ ok: true }, { status: 202, headers: SIN_CACHE })
    // Ya los mandó: NO se reescribe el borrador que Alberto está revisando. Las correcciones van por Alberto (✏️).
    if (r.codigo === 'ya_recibida') return NextResponse.json({ error: TEXTO_YA_RECIBIDA, codigo: 'ya_recibida' }, { status: 409, headers: SIN_CACHE })
    const status = r.codigo === 'ya_emitida' ? 409 : r.codigo === 'caducada' ? 410 : 404
    return NextResponse.json({ error: r.codigo === 'ya_emitida' ? 'La factura de esta reserva ya está emitida' : 'Enlace no válido' }, { status, headers: SIN_CACHE })
  }
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE })
}
