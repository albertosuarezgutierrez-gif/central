import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { descargarPdfPresupuestoAsegura } from '@/lib/presupuesto-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/correduria/presupuesto/pdf?id= — el presupuesto en PDF, en streaming desde asegura.
 * Solo lectura y gratis: descargarlo no avisa a nadie. Lo que no sea un PDF no se reenvía.
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
