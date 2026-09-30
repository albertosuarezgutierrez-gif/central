import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { descargarPdfPresupuestoAsegura, marcarDescargadoAsegura } from '@/lib/presupuesto-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/correduria/presupuesto/pdf?id= — el presupuesto en PDF, en streaming desde asegura.
 * Gratis: descargarlo no avisa a nadie. Lo que no sea un PDF no se reenvía.
 *
 * Desde el 30/09/2026 SELLA en asegura la descarga (`documento_descargado_at` + evento): es lo que
 * deja seguir lo que se ha dado al cliente por su referencia. 🚨 No es «enviado» (descargar no prueba
 * que saliera). Si el sello falla el PDF se sirve igual —el documento es correcto— y el sello no consta.
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = new URL(req.url).searchParams.get('id') ?? ''
  let r: Response | null
  try {
    r = await descargarPdfPresupuestoAsegura(id)
  } catch {
    return NextResponse.json({ error: 'asegura no ha respondido (red o tiempo agotado): vuelve a intentarlo' }, { status: 502 })
  }
  if (!r) return NextResponse.json({ error: 'falta ASEGURA_OPERADOR_SECRET en plataforma' }, { status: 503 })
  if (!r.ok || r.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/pdf') {
    return NextResponse.json({ error: `asegura respondió ${r.status}` }, { status: r.ok ? 502 : r.status })
  }
  // Se sella solo cuando el PDF de verdad sale (tras comprobar que lo es). Con tope corto
  // (`SELLO_DESCARGA_MS`, 3 s, abortado por señal) y sin lanzar: el sello NUNCA retiene el PDF.
  await marcarDescargadoAsegura(id, guarda.session.email).catch(() => false)
  const nombre = (r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'presupuesto.pdf')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\]/g, '').slice(0, 120)
  return new Response(r.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${nombre}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  })
}
