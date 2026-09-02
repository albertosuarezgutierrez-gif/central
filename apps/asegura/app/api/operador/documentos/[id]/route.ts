import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { borrarDocumento, leerDocumento, marcarRevisado } from '@/lib/cartera-documentos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/operador/documentos/[id] — el fichero entero (bytes). */
export async function GET(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  const correduria = await correduriaUnica()
  if (!correduria) return NextResponse.json({ estado: 'error' }, { status: 500 })
  const d = await leerDocumento(correduria.id, id)
  if (!d) return NextResponse.json({ error: 'no existe o no tiene fichero' }, { status: 404 })
  return new Response(new Uint8Array(d.contenido), {
    headers: {
      'content-type': d.mime,
      'content-length': String(d.contenido.length),
      // El nombre va en ASCII plano + UTF-8 codificado: los navegadores viejos leen el primero.
      'content-disposition': `inline; filename="${d.nombre.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
      'cache-control': 'private, no-store',
    },
  })
}

/** PATCH { accion: 'revisar', por } — marca revisado. */
export async function PATCH(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  const correduria = await correduriaUnica()
  if (!correduria) return NextResponse.json({ estado: 'error' }, { status: 500 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (body?.accion !== 'revisar') return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
  const por = typeof body.por === 'string' && body.por.trim() ? body.por.trim() : 'corredor'
  const ok = await marcarRevisado(correduria.id, id, por)
  if (!ok) return NextResponse.json({ error: 'no existe, no es de esta correduría o aún está pedido' }, { status: 404 })
  return NextResponse.json({ estado: 'ok' })
}

/** DELETE — el corredor se equivocó de ficha. */
export async function DELETE(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  const correduria = await correduriaUnica()
  if (!correduria) return NextResponse.json({ estado: 'error' }, { status: 500 })
  const ok = await borrarDocumento(correduria.id, id)
  if (!ok) return NextResponse.json({ error: 'no existe' }, { status: 404 })
  return NextResponse.json({ estado: 'ok' })
}
