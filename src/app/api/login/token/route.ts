import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')
  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('restaurantes')
    .select('codigo_acceso, nombre, activo')
    .eq('access_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 })
  }

  if (!data.activo) {
    return NextResponse.json({ error: 'Restaurante inactivo' }, { status: 403 })
  }

  return NextResponse.json({
    codigo_acceso: data.codigo_acceso,
    nombre: data.nombre,
  })
}
