export const dynamic = 'force-dynamic'

// GET /api/metodos-pago → lista los métodos activos del restaurante
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data } = await supabase
    .from('metodos_pago').select('id, nombre, tipo, icono, color')
    .eq('local_id', rid).eq('activo', true).order('orden')
  return NextResponse.json({ metodos: data ?? [] })
}
