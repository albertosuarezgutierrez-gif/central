import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

/**
 * GET /api/portal?action=stats|ventas|locales
 * Auth: x-ia-session con cuenta_id (usuarios de grupo)
 *
 * Devuelve métricas agregadas de TODOS los restaurantes de una cuenta.
 */
export async function GET(req: NextRequest) {
  const sesStr = req.headers.get('x-ia-session')
  if (!sesStr) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let session: { cuenta_id?: string; rol?: string; id?: string } | null = null
  try { session = JSON.parse(sesStr) } catch { return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 }) }

  const cuentaId = session?.cuenta_id
  if (!cuentaId) return NextResponse.json({ error: 'Sin cuenta_id' }, { status: 401 })

  const supabase = createServerClient()
  const url      = new URL(req.url)
  const action   = url.searchParams.get('action') ?? 'stats'

  // ── stats: métricas en tiempo real de todos los locales ──
  if (action === 'stats') {
    const { data, error } = await supabase
      .from('v_portal_stats')
      .select('*')
      .eq('cuenta_id', cuentaId)
      .order('restaurante_nombre')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const locales = data ?? []
    const resumen = {
      total_locales:        locales.length,
      abiertos:             locales.filter(l => l.turno_abierto).length,
      cerrados:             locales.filter(l => !l.turno_abierto).length,
      ventas_hoy:           locales.reduce((s, l) => s + Number(l.ventas_hoy  ?? 0), 0),
      ventas_ayer:          locales.reduce((s, l) => s + Number(l.ventas_ayer ?? 0), 0),
      comandas_activas:     locales.reduce((s, l) => s + Number(l.comandas_activas ?? 0), 0),
      stock_critico:        locales.reduce((s, l) => s + Number(l.stock_critico ?? 0), 0),
      elaboraciones_criticas: locales.reduce((s, l) => s + Number(l.elaboraciones_criticas ?? 0), 0),
      docs_revision:        locales.reduce((s, l) => s + Number(l.docs_revision ?? 0), 0),
    }
    return NextResponse.json({ resumen, locales })
  }

  // ── ventas: tendencia 7 días de todos los locales ──
  if (action === 'ventas') {
    const { data, error } = await supabase
      .from('v_portal_ventas_semana')
      .select('*')
      .eq('cuenta_id', cuentaId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Agrupar por fecha para gráfica consolidada
    const porFecha: Record<string, number> = {}
    for (const row of data ?? []) {
      const f = row.fecha as string
      porFecha[f] = (porFecha[f] ?? 0) + Number(row.ventas_dia ?? 0)
    }
    const grafica = Object.entries(porFecha)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([fecha, total]) => ({ fecha, total: Math.round(total * 100) / 100 }))

    return NextResponse.json({ grafica, por_local: data ?? [] })
  }

  // ── locales: lista de restaurantes de la cuenta ──
  if (action === 'locales') {
    const { data, error } = await supabase
      .from('restaurantes')
      .select('id, nombre, direccion, telefono, activo, created_at')
      .eq('cuenta_id', cuentaId)
      .order('nombre')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ locales: data ?? [] })
  }

  return NextResponse.json({ error: 'action inválido' }, { status: 400 })
}
