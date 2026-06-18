export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

function hoy(): string { return new Date().toISOString().slice(0, 10) }

/** GET /api/cocina/recepciones?fecha=YYYY-MM-DD — albaranes recibidos */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const fecha = req.nextUrl.searchParams.get('fecha') || hoy()

  const { data, error } = await supabase
    .from('cocina_recepciones').select('*').eq('local_id', rid).eq('fecha', fecha).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fecha, recepciones: data ?? [] })
}

/** POST /api/cocina/recepciones — registra una recepción de mercancía */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const body = await req.json()
  const producto = String(body.producto ?? '').trim()
  if (!producto) return NextResponse.json({ error: 'El producto es obligatorio' }, { status: 400 })

  const { data, error } = await supabase
    .from('cocina_recepciones')
    .insert({
      local_id: rid,
      fecha: body.fecha || hoy(),
      producto,
      proveedor: body.proveedor?.trim() || null,
      lote: body.lote?.trim() || null,
      temperatura: body.temperatura != null && body.temperatura !== '' ? Number(body.temperatura) : null,
      conforme: body.conforme ?? true,
      observaciones: body.observaciones?.trim() || null,
    })
    .select('id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Error registrando recepción' }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
