// Puerto ADMIN → plataforma gestiona sugerencias con Bearer OPERADOR_SHARED_SECRET.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

const sb = () => createServerClient()

// GET /api/admin/sugerencias?estado=&categoria=&no_leidas=1
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const estado      = searchParams.get('estado')
  const categoria   = searchParams.get('categoria')
  const soloNoLeidas = searchParams.get('no_leidas') === '1'

  let q = sb()
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sugerencias: data ?? [] })
}

// PATCH /api/admin/sugerencias — marcar leída, cambiar estado, añadir nota
export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, leida, estado, nota_admin } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (leida !== undefined) updates.leida = leida
  if (estado !== undefined) updates.estado = estado
  if (nota_admin !== undefined) updates.nota_admin = nota_admin

  const { error } = await sb().from('sugerencias').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
