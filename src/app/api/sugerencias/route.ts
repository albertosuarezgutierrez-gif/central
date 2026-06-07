export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const supa = () => createServerClient()

// POST /api/sugerencias — cualquier usuario autenticado envía una sugerencia
export async function POST(req: NextRequest) {
  try {
    const sessionHeader = req.headers.get('x-ia-session')
    if (!sessionHeader) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    const session = JSON.parse(sessionHeader)
    const body = await req.json()

    const { categoria, texto } = body
    if (!texto || texto.trim().length < 5) {
      return NextResponse.json({ error: 'El texto debe tener al menos 5 caracteres' }, { status: 400 })
    }
    if (!['bug', 'mejora', 'idea', 'urgente'].includes(categoria)) {
      return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
    }

    const db = supa()
    const { data, error } = await db
      .from('sugerencias')
      .insert({
        local_id: session.restaurante_id || null,
        camarero_id: session.id || null,
        rol: session.rol,
        nombre_usuario: session.nombre,
        categoria,
        texto: texto.trim(),
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, id: data.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/sugerencias — solo super_admin
export async function GET(req: NextRequest) {
  try {
    const sessionHeader = req.headers.get('x-ia-session')
    if (!sessionHeader) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    const session = JSON.parse(sessionHeader)
    if (session.rol !== 'super_admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const estado = searchParams.get('estado')
    const categoria = searchParams.get('categoria')
    const soloNoLeidas = searchParams.get('no_leidas') === '1'

    const db = supa()
    let q = db
      .from('sugerencias')
      .select(`
        id, rol, nombre_usuario, categoria, texto, leida, estado,
        nota_admin, created_at,
        restaurantes(nombre, ciudad)
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (estado) q = q.eq('estado', estado)
    if (categoria) q = q.eq('categoria', categoria)
    if (soloNoLeidas) q = q.eq('leida', false)

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json({ sugerencias: data ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/sugerencias — marcar leída, cambiar estado, añadir nota
export async function PATCH(req: NextRequest) {
  try {
    const sessionHeader = req.headers.get('x-ia-session')
    if (!sessionHeader) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    const session = JSON.parse(sessionHeader)
    if (session.rol !== 'super_admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const body = await req.json()
    const { id, leida, estado, nota_admin } = body
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const db = supa()
    const updates: Record<string, unknown> = {}
    if (leida !== undefined) updates.leida = leida
    if (estado) updates.estado = estado
    if (nota_admin !== undefined) updates.nota_admin = nota_admin

    const { error } = await db.from('sugerencias').update(updates).eq('id', id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
