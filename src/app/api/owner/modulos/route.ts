import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

const TODOS_MODULOS = [
  'voz','mesas','comandas','cobro','impresion','turnos',
  'kds','supervisor','forecaster','fichajes','verifactu',
  'almacen','carta_vinos','qr','storefront','reservas',
  'rrhh','escaner','contabilidad','analytics',
]

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data } = await supabase
    .from('restaurantes')
    .select('modulos_activos')
    .eq('id', rid)
    .single()
  return NextResponse.json({
    modulos_activos: data?.modulos_activos ?? TODOS_MODULOS
  })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { modulos_activos } = await req.json()
  if (!Array.isArray(modulos_activos)) {
    return NextResponse.json({ error: 'modulos_activos debe ser un array' }, { status: 400 })
  }
  // Núcleo siempre activo — no se puede desactivar
  const NUCLEO = ['voz','mesas','comandas','cobro','impresion','turnos','verifactu']
  const final = [...new Set([...NUCLEO, ...modulos_activos])]
  const { error } = await supabase
    .from('restaurantes')
    .update({ modulos_activos: final })
    .eq('id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ modulos_activos: final })
}
