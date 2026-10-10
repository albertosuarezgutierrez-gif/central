import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerPdfTrabajo } from '@/lib/tarificador-lectura'
import { indicePdfValido } from '@/lib/tarificador-lectura-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/trabajo/[id]/pdf/[indice]` — el PDF de la oferta (índice del worker,
 * el `pdfIndice` de la oferta). Bearer de operador, por correduría. Siempre `attachment` + `nosniff`.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; indice: string }> }) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id, indice } = await ctx.params
  const i = indicePdfValido(indice)
  if (!UUID.test(id) || i === null) return NextResponse.json({ estado: 'error', mensaje: 'id o índice no válidos' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const d = await leerPdfTrabajo(correduria.id, id, i)
    if (!d) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return new Response(new Uint8Array(d.contenido), {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(d.contenido.length),
        'content-disposition': `attachment; filename="${d.nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/pdf', e) }, { status: 503 })
  }
}
