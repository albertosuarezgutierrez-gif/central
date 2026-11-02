export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)

  if (!session?.id || !session?.restaurante_id) {
    return NextResponse.json({ turno: null })
  }

  const supabase = createServerClient()

  const { data } = await supabase
    .from('turnos')
    .select('id, entrada_at, nombre, tipo')
    .eq('camarero_id', session.id)
    .eq('local_id', session.restaurante_id)
    .eq('estado', 'activo')
    .order('entrada_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ turno: data ?? null })
}
