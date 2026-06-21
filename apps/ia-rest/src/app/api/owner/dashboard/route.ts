export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/owner/dashboard
 * Métricas clave del día: ventas, stock crítico, elaboraciones, comandas
 * Para el dashboard de inicio del /owner
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const hoy   = new Date()
  hoy.setHours(0,0,0,0)
  const ayer  = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)
  const semana = new Date(hoy)
  semana.setDate(semana.getDate() - 7)

  const [
    { data: comandasHoy },
    { data: comandasAyer },
    { data: stockCritico },
    { data: elaboraciones },
    { data: ventasSemana },
    { data: topProductos },
  ] = await Promise.all([
    // Comandas + ventas de hoy
    supabase.from('comandas').select('id, estado, cobrado_at, comanda_items(precio_unitario, cantidad)')
      .eq('local_id', rid).eq('estado', 'cerrada')
      .gte('cobrado_at', hoy.toISOString()),

    // Comandas ayer para comparativa
    supabase.from('comandas').select('id, comanda_items(precio_unitario, cantidad)')
      .eq('local_id', rid).eq('estado', 'cerrada')
      .gte('cobrado_at', ayer.toISOString())
      .lt('cobrado_at', hoy.toISOString()),

    // Stock crítico
    supabase.from('stock_articulos').select('id, nombre, stock_actual, stock_minimo, unidad_compra')
      .eq('local_id', rid).eq('alerta_activa', true).eq('activo', true)
      .order('stock_actual', { ascending: true }).limit(5),

    // Elaboraciones próximas a caducar
    supabase.from('v_elaboraciones_activas')
      .select('id, nombre, lote, fecha_caducidad, horas_restantes, urgencia')
      .eq('local_id', rid)
      .in('urgencia', ['critica', 'hoy'])
      .order('fecha_caducidad', { ascending: true }).limit(5),

    // Ventas últimos 7 días para gráfica
    supabase.rpc('fn_ventas_por_dia', { p_restaurante_id: rid, p_dias: 7 })
      .select('*'),

    // Top 5 productos de hoy
    supabase.from('comanda_items').select('nombre, cantidad, precio_unitario')
      .eq('local_id', rid)
      .gte('created_at', hoy.toISOString())
      .limit(100),
  ])

  // Calcular totales
  const calcVentas = (rows: {comanda_items: {precio_unitario: number; cantidad: number}[]}[] | null) =>
    (rows ?? []).reduce((s, c) =>
      s + (c.comanda_items ?? []).reduce((si, i) => si + Number(i.precio_unitario) * Number(i.cantidad), 0)
    , 0)

  const ventasHoy  = calcVentas(comandasHoy as Parameters<typeof calcVentas>[0])
  const ventasAyer = calcVentas(comandasAyer as Parameters<typeof calcVentas>[0])
  const variacion  = ventasAyer ? Math.round(((ventasHoy - ventasAyer) / ventasAyer) * 100) : null

  // Top productos de hoy
  const prodMap: Record<string, { nombre: string; unidades: number; ingresos: number }> = {}
  for (const it of (topProductos ?? []) as {nombre: string; cantidad: number; precio_unitario: number}[]) {
    if (!prodMap[it.nombre]) prodMap[it.nombre] = { nombre: it.nombre, unidades: 0, ingresos: 0 }
    prodMap[it.nombre].unidades += Number(it.cantidad)
    prodMap[it.nombre].ingresos += Number(it.cantidad) * Number(it.precio_unitario)
  }
  const topHoy = Object.values(prodMap)
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 5)

  return NextResponse.json({
    ventas_hoy:   Math.round(ventasHoy   * 100) / 100,
    ventas_ayer:  Math.round(ventasAyer  * 100) / 100,
    variacion_pct: variacion,
    num_comandas: (comandasHoy ?? []).length,
    stock_critico: stockCritico ?? [],
    elaboraciones_criticas: elaboraciones ?? [],
    top_productos_hoy: topHoy,
    grafica_semana: ventasSemana ?? [],
  })
}
