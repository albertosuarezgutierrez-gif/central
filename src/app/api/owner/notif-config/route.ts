export const dynamic = 'force-dynamic'

// /api/owner/notif-config — GET y PUT de notif_config del restaurante
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase
    .from('restaurantes')
    .select('notif_config')
    .eq('id', rid)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data?.notif_config ?? {})
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const body = await req.json()

  // Merge con el config actual para no perder claves
  const { data: current } = await supabase
    .from('restaurantes')
    .select('notif_config')
    .eq('id', rid)
    .single()

  const merged = {
    ...(current?.notif_config ?? {}),
    ...body,
    marchar: {
      ...(current?.notif_config?.marchar ?? {}),
      ...(body.marchar ?? {}),
    },
  }

  const { data, error } = await supabase
    .from('restaurantes')
    .update({ notif_config: merged })
    .eq('id', rid)
    .select('notif_config')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data.notif_config)
}
