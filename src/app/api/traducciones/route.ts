export const dynamic = 'force-dynamic'

// app/api/traducciones/route.ts
// GET  ?producto_id=xxx        → todas las traducciones de un producto
// POST { producto_id, idioma, nombre, descripcion } → upsert
// DELETE ?producto_id=xxx&idioma=en → eliminar

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'

const IDIOMAS_VALIDOS = ['en', 'fr', 'de', 'it', 'pt', 'zh', 'ar']

export async function GET(req: NextRequest) {
  try {
    const rid = getRestauranteId(req)
    const productoId = req.nextUrl.searchParams.get('producto_id')
    if (!productoId) {
      return NextResponse.json({ error: 'producto_id requerido' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('producto_traducciones')
      .select('idioma, nombre, descripcion')
      .eq('producto_id', productoId)
      .eq('restaurante_id', rid)

    if (error) throw error
    return NextResponse.json({ ok: true, traducciones: data ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const rid = getRestauranteId(req)
    const body = await req.json()
    const { producto_id, idioma, nombre, descripcion } = body

    if (!producto_id || !idioma || !nombre?.trim()) {
      return NextResponse.json(
        { error: 'producto_id, idioma y nombre son obligatorios' },
        { status: 400 }
      )
    }
    if (!IDIOMAS_VALIDOS.includes(idioma)) {
      return NextResponse.json({ error: `Idioma '${idioma}' no soportado` }, { status: 400 })
    }

    const supabase = createServerClient()
    const { error } = await supabase
      .from('producto_traducciones')
      .upsert(
        {
          producto_id,
          restaurante_id: rid,
          idioma,
          nombre: nombre.trim(),
          descripcion: descripcion?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'producto_id,idioma' }
      )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const rid = getRestauranteId(req)
    const productoId = req.nextUrl.searchParams.get('producto_id')
    const idioma     = req.nextUrl.searchParams.get('idioma')

    if (!productoId || !idioma) {
      return NextResponse.json({ error: 'producto_id e idioma requeridos' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { error } = await supabase
      .from('producto_traducciones')
      .delete()
      .eq('producto_id', productoId)
      .eq('idioma', idioma)
      .eq('restaurante_id', rid)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
