export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// Bajo /api/super/* → cubierto por el middleware shield (cookie __super_shield).
// Además se exige sesión FIRMADA con rol super_admin (defensa en profundidad).
const supa = () => createServerClient()

function requireSuper(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return null
  return session
}

// GET /api/super/sugerencias — lista global de sugerencias (solo super_admin)
export async function GET(req: NextRequest) {
  try {
    if (!requireSuper(req)) {
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

// PATCH /api/super/sugerencias — marcar leída, cambiar estado, añadir nota (solo super_admin)
export async function PATCH(req: NextRequest) {
  try {
    if (!requireSuper(req)) {
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