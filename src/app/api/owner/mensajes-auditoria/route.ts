// GET /api/owner/mensajes-auditoria
// Historial de mensajes entre roles para el owner
// Filtros: desde, hasta (YYYY-MM-DD), rol (origen)
// Retención: solo devuelve mensajes de los últimos 5 días
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['owner', 'super_admin', 'jefe_sala'].includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const params = req.nextUrl.searchParams
  const desdeParam = params.get('desde')   // YYYY-MM-DD
  const hastaParam = params.get('hasta')   // YYYY-MM-DD
  const rol        = params.get('rol')     // camarero|cocina|jefe_sala|running|null

  // Límite duro: nunca más de 5 días hacia atrás
  const limiteAbsoluto = new Date()
  limiteAbsoluto.setDate(limiteAbsoluto.getDate() - 5)

  const desde = desdeParam
    ? new Date(Math.max(new Date(desdeParam + 'T00:00:00Z').getTime(), limiteAbsoluto.getTime())).toISOString()
    : limiteAbsoluto.toISOString()

  const hasta = hastaParam
    ? new Date(hastaParam + 'T23:59:59Z').toISOString()
    : new Date().toISOString()

  let q = supabase
    .from('mensajes_turno')
    .select('id,camarero_id,rol_origen,nombre_origen,rol_destino,destinatario_id,tipo,texto,mesa_ref,leido_por,created_at')
    .eq('restaurante_id', rid)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .order('created_at', { ascending: true })
    .limit(500)

  if (rol && rol !== 'todos') {
    q = q.eq('rol_origen', rol)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ mensajes: data ?? [], total: (data ?? []).length })
}
