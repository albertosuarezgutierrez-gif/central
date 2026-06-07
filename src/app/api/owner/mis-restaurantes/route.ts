export const dynamic = 'force-dynamic'

// GET /api/owner/mis-restaurantes
// Devuelve todos los restaurantes activos de la misma cuenta que la sesión actual.
// Usado por el switcher multi-local del panel owner.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const header = req.headers.get('x-ia-session')
  if (!header) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let session: { rol: string; cuenta_id?: string; local_id: string } | null = null
  try { session = JSON.parse(header) } catch { return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 }) }

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
