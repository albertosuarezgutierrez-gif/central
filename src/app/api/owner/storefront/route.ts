export const dynamic = 'force-dynamic'

// GET  /api/owner/storefront        → leer config
// POST /api/owner/storefront        → crear/actualizar config
// Requiere sesión owner/admin

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { data } = await supabase
    .from('storefront_config')
    .select('*')
    .eq('local_id', session.restaurante_id)
    .single()

  return NextResponse.json({ config: data ?? null })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const supabase = createServerClient()
  const body = await req.json()

  // Validar slug único (solo letras, números y guiones)
  if (body.slug) {
    const slugLimpio = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const { data: existente } = await supabase
      .from('storefront_config')
      .select('restaurante_id')
      .eq('slug', slugLimpio)
      .neq('local_id', session.restaurante_id)
      .single()

    if (existente) {
      return NextResponse.json({ error: 'Ese slug ya está en uso' }, { status: 409 })
    }
    body.slug = slugLimpio
  }

  const { data, error } = await supabase
    .from('storefront_config')
    .upsert({
      local_id: session.restaurante_id,
      ...body,
    }, { onConflict: 'restaurante_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, config: data })
}
