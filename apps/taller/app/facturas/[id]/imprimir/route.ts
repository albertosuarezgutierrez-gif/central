// Factura imprimible (HTML → «Guardar como PDF») con el QR tributario. Exige sesión y permiso `facturar` (rol re-leído en BD).
import QRCode from 'qrcode'
import { conPermiso, mensajeDeAcceso } from '@/lib/contexto'
import { cargarFacturaVista } from '@/lib/facturas-vista'
import { renderFacturaHtml } from '@/lib/factura-html'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return new Response('No encontrada', { status: 404 })
  try {
    const f = await conPermiso('facturar', (tx, c) => cargarFacturaVista(tx as never, c.tallerId, id))
    if (!f) return new Response('No encontrada', { status: 404 })
    // ISO/IEC 18004, nivel de corrección M (especificación AEAT del QR).
    const qrDataUrl = await QRCode.toDataURL(f.qrUrl, { errorCorrectionLevel: 'M', margin: 2, width: 264 })
    return new Response(renderFacturaHtml({ ...f, qrDataUrl }), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' },
    })
  } catch (e) {
    const m = mensajeDeAcceso(e)
    if (m) return new Response(m, { status: 403 })
    console.error('[facturas/imprimir]', e)
    return new Response('No se pudo generar la factura', { status: 500 })
  }
}
