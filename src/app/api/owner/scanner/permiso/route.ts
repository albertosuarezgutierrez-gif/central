export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

// POST /api/owner/scanner/permiso  { camarero_id, puede_escanear }
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  if (!rid) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { camarero_id, puede_escanear } = await req.json()
  if (!camarero_id) return NextResponse.json({ error: 'camarero_id requerido' }, { status: 400 })

  const { error } = await supabase
    .from('camareros')
    .update({ puede_escanear: !!puede_escanear })
    .eq('id', camarero_id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, puede_escanear: !!puede_escanear })
}
