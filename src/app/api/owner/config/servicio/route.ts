import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const { data } = await supabase
      .from('restaurantes')
      .select('servicio_activo,servicio_precio,servicio_nombre,servicio_auto,servicio_skip')
      .eq('id', rid).single()
    return NextResponse.json({ config: data ?? {} })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const body = await req.json()
    const allowed = ['servicio_activo','servicio_precio','servicio_nombre','servicio_auto','servicio_skip']
    const update: Record<string,unknown> = {}
    for (const k of allowed) if (k in body) update[k] = body[k]
    await supabase.from('restaurantes').update(update).eq('id', rid)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
