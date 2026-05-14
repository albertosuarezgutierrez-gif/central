import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { nombre_cuenta } = await req.json()

  const { error } = await supabase
    .from('comandas')
    .update({ nombre_cuenta: nombre_cuenta ?? null })
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
