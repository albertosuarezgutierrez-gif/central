export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  let session: { id: string; restaurante_id: string } | null = null
  try {
    const h = req.headers.get('x-ia-session')
    session = h ? JSON.parse(h) : null
  } catch { /* noop */ }

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
