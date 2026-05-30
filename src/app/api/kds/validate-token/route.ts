export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { firmarSesion } from '@/lib/session-sign'

// GET /api/kds/validate-token?token=XXXX
// Valida el kds_token de un restaurante y devuelve sesión sintética para el KDS
// No requiere sesión previa — es el acceso de pantalla permanente

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('restaurantes')
    .select('id, nombre, activo, kds_token')
    .eq('kds_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Token no encontrado' }, { status: 404 })
  }

  if (!data.activo) {
    return NextResponse.json({ error: 'Restaurante inactivo' }, { status: 403 })
  }

  // Sesión sintética para el KDS — rol cocina, sin camarero_id real
  // El KDS solo necesita restaurante_id para las queries Realtime
  return NextResponse.json({
    session: firmarSesion({
      id:                 `kds-${data.id}`,
      nombre:             'KDS',
      rol:                'cocina' as const,
      restaurante_id:     data.id,
      restaurante_nombre: data.nombre,
      seccion_id:         null,   // se lee de ?seccion= en URL
    })
  })
}
