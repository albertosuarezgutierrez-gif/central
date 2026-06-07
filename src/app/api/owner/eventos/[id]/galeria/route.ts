import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('evento_galeria')
    .select('*, subida_por_personal:personal(id, nombre)')
    .eq('evento_id', id)
    .eq('local_id', restauranteId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fotos: data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { url, cloudinary_id, caption } = body

  if (!url) return NextResponse.json({ error: 'Falta URL' }, { status: 400 })

  const { data, error } = await supabase
    .from('evento_galeria')
    .insert({
      local_id: restauranteId,
      evento_id: id,
      url, cloudinary_id, caption,
      subida_por: session.id
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ foto: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventoId } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { foto_id, ...updates } = await req.json()
  const { data, error } = await supabase
    .from('evento_galeria')
    .update(updates)
    .eq('id', foto_id)
    .eq('evento_id', eventoId)
    .eq('local_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ foto: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventoId } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { foto_id } = await req.json()
  const { error } = await supabase
    .from('evento_galeria')
    .delete()
    .eq('id', foto_id)
    .eq('evento_id', eventoId)
    .eq('local_id', restauranteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
