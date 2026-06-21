export const dynamic = 'force-dynamic'

// GET /api/owner/mis-restaurantes
// Devuelve todos los restaurantes activos de la misma cuenta que la sesión actual.
// Usado por el switcher multi-local del panel owner.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  // Sesión FIRMADA: el cuenta_id se deriva de aquí, nunca de un header crudo
  const session = getSession(req)
  if (!session || (session.rol !== 'owner' && session.rol !== 'super_admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  if (!session.cuenta_id) {
    // Sesión antigua sin cuenta_id — devolver solo el restaurante actual
    return NextResponse.json({ restaurantes: [], cuenta_id: null })
  }

  const sb = createServerClient()

  const { data: restaurantes, error } = await sb
    .from('restaurantes')
    .select('id, nombre, ciudad, activo, codigo_acceso')
    .eq('cuenta_id', session.cuenta_id)
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ restaurantes: restaurantes ?? [], cuenta_id: session.cuenta_id })
}