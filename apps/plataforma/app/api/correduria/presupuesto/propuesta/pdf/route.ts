import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { descargarPdfPropuestaAsegura } from '@/lib/propuesta-escenarios-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/correduria/presupuesto/propuesta/pdf?id= — la propuesta de escenarios en PDF, en streaming desde asegura.
 * Gratis y repetible: se arma cada vez desde los presupuestos. Descargarla no avisa a nadie ni sella «enviado».
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = new URL(req.url).searchParams.get('id') ?? ''
  let r: Response | null
  try {
    r = await descargarPdfPropuestaAsegura(id)
  } catch {
    return NextResponse.json({ error: 'asegura no ha respondido (red o tiempo agotado): vuelve a intentarlo' }, { status: 502 })
  }
  if (!r) return NextResponse.json({ error: 'falta ASEGURA_OPERADOR_SECRET en plataforma' }, { status: 503 })
  if (!r.ok || r.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/pdf') {
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null
    return NextResponse.json({ error: typeof j?.detalle === 'string' ? j.detalle : `asegura respondió ${r.status}` }, { status: r.ok ? 502 : r.status })
  }
  const nombre = (r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'propuesta.pdf')
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
