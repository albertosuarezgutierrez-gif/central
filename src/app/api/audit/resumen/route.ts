import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const desde = new Date(); desde.setHours(0,0,0,0)
  const { data } = await supabase
    .from('comanda_audit_log')
    .select('id,accion,camarero_nombre,item_nombre,item_cantidad_antes,item_cantidad_despues,notas_antes,notas_despues,es_propietario,created_at')
    .eq('restaurante_id', rid)
    .gte('created_at', desde.toISOString())
    .order('created_at', { ascending: false })
    .limit(200)
  return NextResponse.json({ audit: data ?? [] })
}
