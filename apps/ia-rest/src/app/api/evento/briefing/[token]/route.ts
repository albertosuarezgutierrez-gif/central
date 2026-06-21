import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// GET pública — cargar datos del wizard por token
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()

  const { data: briefing, error } = await supabase
    .from('evento_briefing')
    .select(`
      id, token, estado, cliente_nombre, cliente_email, cliente_telefono,
      expires_at, respuestas,
      restaurante:restaurantes(id, nombre, logo_url, ciudad)
    `)
    .eq('token', token)
    .eq('estado', 'pendiente')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !briefing) {
    return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 404 })
  }

  return NextResponse.json({ briefing })
}
