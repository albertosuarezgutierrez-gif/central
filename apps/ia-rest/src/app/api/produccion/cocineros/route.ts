export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET — personal con rol de cocina del restaurante (para asignar producción).
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  // La tabla 'personal' usa local_id (rename expand-contract); rol 'cocina'.
  const { data, error } = await supabase
    .from('personal')
    .select('id, nombre, rol, seccion_id')
    .eq('local_id', rid)
    .eq('rol', 'cocina')
    .order('nombre', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cocineros: data ?? [] })
}
