import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { pin, restaurante_id } = await req.json()

  if (!pin || !restaurante_id) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  // Buscar coordinador por PIN en el restaurante
  const { data: coordinador, error } = await supabase
    .from('personal')
    .select('id, nombre, rol, pin, restaurante_id, activo')
    .eq('restaurante_id', restaurante_id)
    .eq('pin', pin)
    .eq('rol', 'coordinador_eventos')
    .eq('activo', true)
    .single()

  if (error || !coordinador) {
    return NextResponse.json({ error: 'PIN incorrecto o sin acceso' }, { status: 401 })
  }

  const session = {
    id: coordinador.id,
    nombre: coordinador.nombre,
    rol: coordinador.rol,
    restaurante_id: restaurante_id,
    ts: Date.now(),
  }

  const res = NextResponse.json({ ok: true, session })
  res.cookies.set('coordinador_session', JSON.stringify(session), {
    httpOnly: true,
    maxAge: 60 * 60 * 12, // 12h
    path: '/',
    sameSite: 'strict',
  })
  return res
}
