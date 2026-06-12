export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// Pantalla del empleado (montador). Devuelve SUS asignaciones de material activas
// (reservado/entregado) con datos del material, para marcar recogido/devuelto y registrar roturas.
// RBAC: el empleado debe tener 'materiales' en modulos_gestion.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const mods = session.modulos_gestion ?? []
  const esOwner = session.rol === 'owner' || session.rol === 'super_admin'
  if (!esOwner && !mods.includes('materiales')) {
    return NextResponse.json({ error: 'Sin acceso al módulo de materiales' }, { status: 403 })
  }

  const supabase = createServerClient()
  const personalId = session.camarero_id

  // El montador ve las asignaciones a su nombre; si no hay personal_id (owner mirando),
  // ve todas las activas del restaurante.
  let q = supabase
    .from('materiales_asignacion')
    .select('id, material_id, destino_tipo, destino_nombre, cantidad, cantidad_devuelta, estado, fecha_salida, notas, material:materiales(nombre, categoria, coste_reposicion)')
    .eq('restaurante_id', rid)
    .neq('estado', 'devuelto')
    .order('created_at', { ascending: false })
  if (personalId && !esOwner) q = q.eq('personal_id', personalId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asignaciones: data ?? [] })
}
