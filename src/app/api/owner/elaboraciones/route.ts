import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/owner/elaboraciones?estado=activa&limite=50
 * Historial completo con stats para el owner
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const url    = new URL(req.url)
  const estado = url.searchParams.get('estado')
  const limite = Number(url.searchParams.get('limite') ?? 50)

  let q = supabase
    .from('elaboraciones_propias')
    .select(`
      id, nombre, lote, cantidad, unidad, num_raciones,
      fecha_elaboracion, fecha_caducidad, dias_caducidad,
      alergenos, temperatura_min, temperatura_max,
      estado, elaborado_por_nombre,
      etiqueta_impresa_at, etiqueta_impresa_veces,
      alerta_24h_enviada, alerta_hoy_enviada,
      notas, created_at
    `)
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (estado) q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stats rápidas
  const ahora = new Date()
  const activas   = (data ?? []).filter(e => e.estado === 'activa')
  const criticas  = activas.filter(e => new Date(e.fecha_caducidad) < new Date(ahora.getTime() + 4 * 3600000))
  const hoy       = activas.filter(e => {
    const h = (new Date(e.fecha_caducidad).getTime() - ahora.getTime()) / 3600000
    return h > 0 && h <= 24
  })

  return NextResponse.json({
    elaboraciones: data ?? [],
    stats: {
      total_activas:  activas.length,
      criticas:       criticas.length,   // caduca en < 4h
      vencen_hoy:     hoy.length,        // caduca en < 24h
    },
  })
}
