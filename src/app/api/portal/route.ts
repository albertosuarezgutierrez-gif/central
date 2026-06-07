export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

/**
 * GET /api/portal?action=stats|ventas|locales
 * Auth: x-ia-session con cuenta_id (usuarios de grupo o PIN cuenta)
 * Usa service_role — cruza múltiples restaurantes sin RLS por restaurante_id
 */
export async function GET(req: NextRequest) {
  // Leer cuenta_id de la sesión
  const sesStr = req.headers.get('x-ia-session')
  if (!sesStr) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let cuentaId: string | null = null
  try {
    const ses = JSON.parse(sesStr)
    cuentaId = ses?.cuenta_id ?? null
  } catch {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }
  if (!cuentaId) return NextResponse.json({ error: 'Sin cuenta_id en sesión' }, { status: 401 })

  const supabase = createServerClient() // service_role — bypasa RLS
  const action = new URL(req.url).searchParams.get('action') ?? 'stats'

  // ── stats: métricas en tiempo real de todos los locales ──────────────────
  if (action === 'stats') {
    // Obtener restaurantes de la cuenta
    const { data: restaurantes } = await supabase
      .from('restaurantes')
      .select('id, nombre, activo')
      .eq('cuenta_id', cuentaId)
      .eq('activo', true)
      .order('nombre')

    if (!restaurantes?.length)
      return NextResponse.json({ resumen: null, locales: [] })

    const rids = restaurantes.map(r => r.id)
    const hoy  = new Date(); hoy.setHours(0,0,0,0)
    const ayer = new Date(hoy); ayer.setDate(ayer.getDate()-1)

    // Ventas hoy y ayer por restaurante (desde comanda_items)
    const { data: ventasHoy } = await supabase
      .from('comandas')
      .select('restaurante_id, comanda_items(precio_unitario, cantidad)')
      .in('local_id', rids)
      .eq('estado', 'cerrada')
      .gte('cobrado_at', hoy.toISOString())

    const { data: ventasAyer } = await supabase
      .from('comandas')
      .select('restaurante_id, comanda_items(precio_unitario, cantidad)')
      .in('local_id', rids)
      .eq('estado', 'cerrada')
      .gte('cobrado_at', ayer.toISOString())
      .lt('cobrado_at', hoy.toISOString())

    // Comandas activas ahora
    const { data: activas } = await supabase
      .from('comandas')
      .select('restaurante_id')
      .in('local_id', rids)
      .in('estado', ['nueva','en_cocina','en_curso'])

    // Stock crítico
    const { data: stock } = await supabase
      .from('stock_articulos')
      .select('restaurante_id')
      .in('local_id', rids)
      .eq('alerta_activa', true)
      .eq('activo', true)

    // Elaboraciones próximas a caducar (<24h)
    const en24h = new Date(Date.now() + 24*3600000).toISOString()
    const { data: elabs } = await supabase
      .from('elaboraciones_propias')
      .select('restaurante_id')
      .in('local_id', rids)
      .eq('estado', 'activa')
      .lte('fecha_caducidad', en24h)

    // Turnos activos (para saber si está abierto)
    const { data: turnos } = await supabase
      .from('turnos')
      .select('restaurante_id')
      .in('local_id', rids)
      .eq('estado', 'activo')
      .is('camarero_id', null)

    // Calcular ventas por restaurante_id
    const calcPorRid = (rows: {restaurante_id: string; comanda_items: {precio_unitario: number; cantidad: number}[]}[] | null) => {
      const m: Record<string, number> = {}
      for (const c of rows ?? []) {
        const sum = (c.comanda_items ?? []).reduce((s, i) => s + Number(i.precio_unitario) * Number(i.cantidad), 0)
        m[c.restaurante_id] = (m[c.restaurante_id] ?? 0) + sum
      }
      return m
    }

    const vHoy  = calcPorRid(ventasHoy  as Parameters<typeof calcPorRid>[0])
    const vAyer = calcPorRid(ventasAyer as Parameters<typeof calcPorRid>[0])

    const countPorRid = (rows: {restaurante_id: string}[] | null) => {
      const m: Record<string, number> = {}
      for (const r of rows ?? []) m[r.restaurante_id] = (m[r.restaurante_id] ?? 0) + 1
      return m
    }

    const activasMap  = countPorRid(activas)
    const stockMap    = countPorRid(stock)
    const elabsMap    = countPorRid(elabs)
    const turnosSet   = new Set((turnos ?? []).map(t => t.restaurante_id))

    const locales = restaurantes.map(r => ({
      restaurante_id:        r.id,
      restaurante_nombre:    r.nombre,
      turno_abierto:         turnosSet.has(r.id),
      comandas_activas:      activasMap[r.id] ?? 0,
      ventas_hoy:            Math.round((vHoy[r.id] ?? 0) * 100) / 100,
      ventas_ayer:           Math.round((vAyer[r.id] ?? 0) * 100) / 100,
      stock_critico:         stockMap[r.id] ?? 0,
      elaboraciones_criticas: elabsMap[r.id] ?? 0,
      docs_revision:         0,
    }))

    const resumen = {
      total_locales:           locales.length,
      abiertos:                locales.filter(l => l.turno_abierto).length,
      cerrados:                locales.filter(l => !l.turno_abierto).length,
      ventas_hoy:              Math.round(locales.reduce((s,l) => s + l.ventas_hoy, 0) * 100) / 100,
      ventas_ayer:             Math.round(locales.reduce((s,l) => s + l.ventas_ayer, 0) * 100) / 100,
      comandas_activas:        locales.reduce((s,l) => s + l.comandas_activas, 0),
      stock_critico:           locales.reduce((s,l) => s + l.stock_critico, 0),
      elaboraciones_criticas:  locales.reduce((s,l) => s + l.elaboraciones_criticas, 0),
      docs_revision:           0,
    }

    return NextResponse.json({ resumen, locales })
  }

  // ── ventas: tendencia 7 días consolidada ─────────────────────────────────
  if (action === 'ventas') {
    const { data: restaurantes } = await supabase
      .from('restaurantes').select('id').eq('cuenta_id', cuentaId).eq('activo', true)
    const rids = (restaurantes ?? []).map(r => r.id)
    if (!rids.length) return NextResponse.json({ grafica: [] })

    const { data: rows } = await supabase
      .from('comandas')
      .select('cobrado_at, comanda_items(precio_unitario, cantidad)')
      .in('local_id', rids)
      .eq('estado', 'cerrada')
      .gte('cobrado_at', new Date(Date.now() - 7 * 86400000).toISOString())

    // Agrupar por día
    const porFecha: Record<string, number> = {}
    for (const c of rows ?? []) {
      const fecha = (c.cobrado_at as string).slice(0, 10)
      const sum = (c.comanda_items as {precio_unitario: number; cantidad: number}[] ?? [])
        .reduce((s, i) => s + Number(i.precio_unitario) * Number(i.cantidad), 0)
      porFecha[fecha] = (porFecha[fecha] ?? 0) + sum
    }

    const grafica = Object.entries(porFecha)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([fecha, total]) => ({ fecha, total: Math.round(total * 100) / 100 }))

    return NextResponse.json({ grafica })
  }

  // ── locales: lista simple ─────────────────────────────────────────────────
  if (action === 'locales') {
    const { data } = await supabase
      .from('restaurantes')
      .select('id, nombre, direccion, telefono, activo')
      .eq('cuenta_id', cuentaId)
      .order('nombre')
    return NextResponse.json({ locales: data ?? [] })
  }

  return NextResponse.json({ error: 'action inválido' }, { status: 400 })
}
