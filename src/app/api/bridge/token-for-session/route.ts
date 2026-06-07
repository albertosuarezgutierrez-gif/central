export const dynamic = 'force-dynamic'

// /api/bridge/token-for-session
// La APK nativa llama este endpoint al arrancar.
// Dado el token de sesión del camarero → devuelve el bridge token del restaurante.
// Si no hay token activo → crea uno automáticamente.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rid = getRestauranteId(req)
  const sb  = createServerClient()

  // Buscar token activo del restaurante
  const { data: bt } = await sb
    .from('bridge_tokens')
    .select('token, nombre')
    .eq('local_id', rid)
    .eq('activo', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (bt) return NextResponse.json({ token: bt.token, nombre: bt.nombre })

  // No hay token — crear uno automáticamente
  const { data: nuevo, error } = await sb
    .from('bridge_tokens')
    .insert({ restaurante_id: rid, nombre: 'Bridge automático' })
    .select('token, nombre')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token: nuevo.token, nombre: nuevo.nombre })
}
