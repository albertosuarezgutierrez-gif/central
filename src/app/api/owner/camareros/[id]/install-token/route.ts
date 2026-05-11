import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { randomUUID } from 'crypto'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  if (!['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const supabase = createServerClient()

  // Verificar que el camarero pertenece a este restaurante
  const { data: cam, error } = await supabase
    .from('camareros')
    .select('id, nombre, rol, restaurante_id, activo')
    .eq('id', id)
    .eq('restaurante_id', session.restaurante_id)
    .single()

  if (error || !cam) {
    return NextResponse.json({ error: 'Camarero no encontrado' }, { status: 404 })
  }

  if (!cam.activo) {
    return NextResponse.json({ error: 'El camarero está de baja' }, { status: 400 })
  }

  // Generar token único de 32 caracteres hex
  const token = randomUUID().replace(/-/g, '')
  const expira_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { error: updateErr } = await supabase
    .from('camareros')
    .update({
      install_token: token,
      install_token_expira_at: expira_at,
      install_token_usado: false,
    })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: 'Error generando token' }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.iarest.es'
  const url = `${base}/acceso?tk=${token}`

  return NextResponse.json({ token, url, expira_at, nombre: cam.nombre, rol: cam.rol })
}
