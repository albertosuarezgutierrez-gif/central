import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { pin } = await req.json()
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('camareros')
    .select('id, nombre, rol')
    .eq('pin', pin)
    .eq('activo', true)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }
  return NextResponse.json({ camarero: { id: data.id, nombre: data.nombre, rol: data.rol } })
}
