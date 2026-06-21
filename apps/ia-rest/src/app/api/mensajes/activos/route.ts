// GET /api/mensajes/activos — devuelve camareros con sesión activa en el restaurante
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  // Camareros con sesión válida (no expirada, no revocada) en este restaurante
  const { data, error } = await supabase
    .from('sesiones_activas')
    .select('camarero_id, personal!inner(id, nombre, rol, local_id)')
    .eq('personal.local_id', rid)
    .gt('expires_at', new Date().toISOString())
    .is('revoked_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduplicar por camarero_id (puede tener varias sesiones activas)
  const seen = new Set<string>()
  const activos = (data ?? [])
    .filter((row: any) => {
      if (seen.has(row.camarero_id)) return false
      seen.add(row.camarero_id)
      return true
    })
    .map((row: any) => ({
      id:     row.camarero_id,
      nombre: row.personal.nombre,
      rol:    row.personal.rol,
    }))

  return NextResponse.json({ activos })
}
