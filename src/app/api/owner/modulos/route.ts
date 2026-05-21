import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

const TODOS_MODULOS = [
  'voz','mesas','comandas','cobro','impresion','turnos',
  'kds','supervisor','forecaster','fichajes','verifactu',
  'almacen','carta_vinos','qr','storefront','reservas',
  'rrhh','escaner','contabilidad','analytics',
]

const NUCLEO = ['voz','mesas','comandas','cobro','impresion','turnos','verifactu']

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data } = await supabase
    .from('restaurantes')
    .select('modulos_activos, configuracion')
    .eq('id', rid)
    .single()
  return NextResponse.json({
    modulos_activos: data?.modulos_activos ?? TODOS_MODULOS,
    configuracion: data?.configuracion ?? {}
  })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const body = await req.json()
  const { modulos_activos, modo_vinos } = body

  if (!Array.isArray(modulos_activos)) {
    return NextResponse.json({ error: 'modulos_activos debe ser un array' }, { status: 400 })
  }

  // Núcleo siempre activo
  const final = [...new Set([...NUCLEO, ...modulos_activos])]

  // Obtener configuracion actual para merge
  const { data: actual } = await supabase
    .from('restaurantes')
    .select('configuracion')
    .eq('id', rid)
    .single()

  const configActual = actual?.configuracion ?? {}
  const configNueva = { ...configActual }

  // Actualizar modo_vinos si se envía y es válido
  if (modo_vinos === 'basico' || modo_vinos === 'carta') {
    configNueva.modo_vinos = modo_vinos
  }

  const { error } = await supabase
    .from('restaurantes')
    .update({ modulos_activos: final, configuracion: configNueva })
    .eq('id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ modulos_activos: final, configuracion: configNueva })
}
