export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const ROLES_SIEMPRE = ['owner', 'super_admin', 'jefe_sala']

// GET /api/scanner/permiso-check
// Rápido check de si el usuario autenticado puede usar el escáner
export async function GET(req: NextRequest) {
  const session = getSession(req)
  const rid     = getRestauranteId(req)

  if (!session || !rid) {
    return NextResponse.json({ puede_escanear: false })
  }

  if (ROLES_SIEMPRE.includes(session.rol)) {
    return NextResponse.json({ puede_escanear: true })
  }

  if (session.rol !== 'camarero') {
    return NextResponse.json({ puede_escanear: false })
  }

  const supabase = createServerClient()
  const { data } = await supabase
    .from('personal')
    .select('puede_escanear')
    .eq('id', session.id)
    .eq('restaurante_id', rid)
    .single()

  return NextResponse.json({ puede_escanear: data?.puede_escanear === true })
}
