import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { borrarDocumentoAsegura, descargarDocumentoAsegura, revisarDocumentoAsegura } from '@/lib/documentos-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

/** GET — el fichero, en streaming desde asegura (sesión de plataforma). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const r = await descargarDocumentoAsegura(id).catch(() => null)
  if (!r) return NextResponse.json({ error: 'asegura sin configurar o sin respuesta' }, { status: 503 })
  if (!r.ok) return NextResponse.json({ error: `asegura respondió ${r.status}` }, { status: r.status })
  const cabeceras = new Headers()
  for (const k of ['content-type', 'content-length', 'content-disposition']) {
    const v = r.headers.get(k)
    if (v) cabeceras.set(k, v)
  }
  cabeceras.set('cache-control', 'private, no-store')
  return new Response(r.body, { headers: cabeceras })
}

/** PATCH { accion: 'revisar' } — lo marca revisado a nombre de quien tiene la sesión. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (body?.accion !== 'revisar') return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
  const por = (session as { email?: string; nombre?: string }).email ?? (session as { nombre?: string }).nombre ?? 'plataforma'
  const r = await revisarDocumentoAsegura(id, por)
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const r = await borrarDocumentoAsegura(id)
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}
