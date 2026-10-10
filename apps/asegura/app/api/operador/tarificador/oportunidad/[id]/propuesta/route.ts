import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { cargarPropuestaOportunidad } from '@/lib/propuesta-oportunidad'
import { jsonPropuesta } from '@/lib/propuesta-oportunidad-reglas'
import { nombreFicheroPropuesta } from '@/lib/propuesta-comercial'
import { pdfPropuesta } from '@/lib/propuesta-comercial-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/oportunidad/[id]/propuesta[?formato=json]` (08/10/2026) — la propuesta comercial
 * de una oportunidad: ofertas de los bots + fichas → comparador → control de calidad por oferta → recomendación.
 * Por defecto el PDF (`attachment`); con `?formato=json` el ranking, los motivos y los errores/avisos de calidad.
 * Solo lectura y NO envía nada: descargar ≠ comunicar. Cliente: solo nombre y referencia. Una oferta con errores
 * de calidad sale con aviso y no se recomienda. 409 `sin_ofertas` si no hay ninguna oferta con precio.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const formato = (new URL(req.url).searchParams.get('formato') ?? 'pdf').trim().toLowerCase()
  if (formato !== 'pdf' && formato !== 'json') return NextResponse.json({ estado: 'error', mensaje: 'formato: pdf o json' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const c = await cargarPropuestaOportunidad(correduria.id, id)
    if (c.estado === 'no_encontrada') return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    const r = c.resultado
    if (r.estado === 'sin_ofertas') return NextResponse.json({ estado: 'sin_ofertas', avisos: r.avisos }, { status: 409 })
    if (formato === 'json') {
      return NextResponse.json({ ...jsonPropuesta(r) }, { headers: { 'cache-control': 'private, no-store' } })
    }
    const pdf = await pdfPropuesta(r.modelo)
    const nombre = nombreFicheroPropuesta(r.modelo)
    return new Response(Buffer.from(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(pdf.length),
        'content-disposition': `attachment; filename="${nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/propuesta', e) }, { status: 503 })
  }
}
