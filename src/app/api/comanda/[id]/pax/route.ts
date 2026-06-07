export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

// PUT /api/comanda/[id]/pax — actualiza num_comensales post-creación (flujo voz)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const { num_comensales } = await req.json()

    if (!num_comensales || num_comensales < 1) {
      return NextResponse.json({ error: 'num_comensales inválido' }, { status: 400 })
    }

    const { error } = await supabase
      .from('comandas')
      .update({ num_comensales })
      .eq('id', id)
      .eq('local_id', rid)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
