import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { MAX_BYTES_FICHERO } from '@/lib/tarificador-grabaciones'
import { subirPantallaAsegura } from '@/lib/tarificador-grabaciones-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ctx = { params: Promise<{ id: string }> }

/**
 * POST ?nombre=pantalla-….html — cuerpo = el HTML que descargó el bookmarklet (text/html). UNA pantalla por
 * petición (el corte de cuerpo de Vercel es 4,5 MB; el tope es 4 MB). asegura lo vuelve a redactar antes de
 * guardarlo y le pone el número siguiente.
 */
export async function POST(req: Request, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no válido' }, { status: 400 })
  const nombre = (new URL(req.url).searchParams.get('nombre') ?? '').trim()
  if (!/\.html?$/i.test(nombre) || nombre.length > 200) return NextResponse.json({ estado: 'error', mensaje: 'el fichero tiene que ser .html' }, { status: 400 })
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES_FICHERO) return NextResponse.json({ estado: 'error', mensaje: 'el fichero pasa de 4 MB' }, { status: 413 })
  const html = await req.text().catch(() => '')
  if (new TextEncoder().encode(html).length > MAX_BYTES_FICHERO) return NextResponse.json({ estado: 'error', mensaje: 'el fichero pasa de 4 MB' }, { status: 413 })
  if (!html.trim()) return NextResponse.json({ estado: 'error', mensaje: 'el fichero está vacío' }, { status: 400 })
  const r = await subirPantallaAsegura(id, nombre, html)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
