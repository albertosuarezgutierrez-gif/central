import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { descargarPdfTarificador } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/correduria/tarificador/trabajo/[id]/pdf/[indice] — el PDF de la oferta del bot, en streaming desde asegura. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; indice: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id, indice } = await ctx.params
  if (!UUID.test(id) || !/^(0|[1-9]\d?)$/.test(indice)) return NextResponse.json({ error: 'id o índice no válidos' }, { status: 400 })
  let r: Response | null
  try {
    r = await descargarPdfTarificador(id, Number(indice))
  } catch {
    return NextResponse.json({ error: 'asegura no ha respondido (red o tiempo agotado): vuelve a intentarlo' }, { status: 502 })
  }
  if (!r) return NextResponse.json({ error: 'falta el secreto de operador en plataforma' }, { status: 503 })
  if (!r.ok || r.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/pdf') {
    return NextResponse.json({ error: `asegura respondió ${r.status}` }, { status: r.ok ? 502 : r.status })
  }
  const nombre = (r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'oferta-allianz.pdf')
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
