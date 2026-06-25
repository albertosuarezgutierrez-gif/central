export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { clasificarCaducidades } from '@/lib/recepcion-caducidades'

/** GET /api/cocina/recepciones/caducidades?dias=3 — productos caducados / por caducar (FEFO). */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const dias = Math.max(0, Math.min(60, Number(req.nextUrl.searchParams.get('dias')) || 3))

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('cocina_recepciones')
    .select('id, producto, lote, caducidad, proveedor')
    .eq('local_id', rid).not('caducidad', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const hoy = new Date().toISOString().slice(0, 10)
  const r = clasificarCaducidades((data ?? []) as Array<{ producto: string; caducidad: string | null }>, hoy, dias)
  return NextResponse.json({ ok: true, ...r })
}
