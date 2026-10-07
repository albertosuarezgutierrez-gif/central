import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { descargarPropuestaOportunidad, leerPropuestaOportunidad } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/correduria/tarificador/oportunidad/[id]/propuesta[?formato=json] — la propuesta comercial de la
 * oportunidad. Por defecto el PDF (descarga, en streaming desde asegura); con `?formato=json` la recomendación
 * (ranking, motivos, errores/avisos de calidad). Con la sesión de la correduría. SOLO DESCARGA: esta ruta nunca
 * envía nada a nadie (regla del proyecto: comunicar al cliente es un paso aparte y con OK de Alberto).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const formato = (new URL(req.url).searchParams.get('formato') ?? 'pdf').trim().toLowerCase()
  if (formato !== 'pdf' && formato !== 'json') return NextResponse.json({ estado: 'error', mensaje: 'formato: pdf o json' }, { status: 400 })

  if (formato === 'json') {
    const r = await leerPropuestaOportunidad(id)
    // 401/403 de asegura es el secreto de operador, no la sesión del usuario: no se reenvía tal cual.
    const status = r.status === 401 || r.status === 403 ? 502 : r.status
    return NextResponse.json(r.json ?? { estado: 'error' }, { status })
  }

  let r: Response | null
  try {
    r = await descargarPropuestaOportunidad(id)
  } catch {
    return NextResponse.json({ error: 'asegura no ha respondido (red o tiempo agotado): vuelve a intentarlo' }, { status: 502 })
  }
  if (!r) return NextResponse.json({ error: 'falta el secreto de operador en plataforma' }, { status: 503 })
  if (!r.ok || r.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/pdf') {
    // Un 409 `sin_ofertas` o un 404 llevan JSON útil: se devuelve su estado, no un PDF roto.
    const cuerpo = (await r.json().catch(() => null)) as Record<string, unknown> | null
    const status = r.ok || r.status === 401 || r.status === 403 ? 502 : r.status
    return NextResponse.json(cuerpo && typeof cuerpo === 'object' ? cuerpo : { error: `asegura respondió ${r.status}` }, { status })
  }
  const nombre = (r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'propuesta.pdf')
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
