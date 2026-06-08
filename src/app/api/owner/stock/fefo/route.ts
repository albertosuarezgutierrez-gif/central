export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/owner/stock/fefo?dias=7
 * Devuelve artículos con lotes próximos a caducar ordenados FEFO (First Expired First Out).
 * dias=7 por defecto — filtra solo los que caducan en los próximos N días.
 * dias=0 → todos los lotes con fecha registrada.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const dias = parseInt(req.nextUrl.searchParams.get('dias') ?? '30')

  const hoy   = new Date()
  const limite = new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000)

  // Buscar items de recepciones confirmadas con fecha_caducidad próxima
  const { data, error } = await supabase
    .from('recepcion_items')
    .select(`
      id, nombre_articulo, cantidad_recibida, unidad, fecha_caducidad, numero_lote,
      stock_articulo_id,
      recepciones_mercancia!inner(estado, fecha_recepcion, local_id, proveedores(nombre))
    `)
    .eq('recepciones_mercancia.local_id', rid)
    .eq('recepciones_mercancia.estado', 'confirmada')
    .not('fecha_caducidad', 'is', null)
    .lte('fecha_caducidad', limite.toISOString().split('T')[0])
    .gte('fecha_caducidad', hoy.toISOString().split('T')[0])
    .order('fecha_caducidad', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const hoyStr = hoy.toISOString().split('T')[0]

  const lotes = (data ?? []).map(row => {
    const rec = (row.recepciones_mercancia as unknown) as {
      fecha_recepcion: string
      proveedores: { nombre: string } | null
    }
    const caducidad = row.fecha_caducidad as string
    const diasRestantes = Math.ceil(
      (new Date(caducidad).getTime() - new Date(hoyStr).getTime()) / (1000 * 60 * 60 * 24)
    )
    return {
      id: row.id,
      nombre:           row.nombre_articulo,
      cantidad:         row.cantidad_recibida,
      unidad:           row.unidad,
      fecha_caducidad:  caducidad,
      numero_lote:      row.numero_lote,
      stock_articulo_id: row.stock_articulo_id,
      proveedor:        rec.proveedores?.nombre ?? null,
      fecha_recepcion:  rec.fecha_recepcion,
      dias_restantes:   diasRestantes,
      urgencia:         diasRestantes <= 1 ? 'critico' : diasRestantes <= 3 ? 'alto' : diasRestantes <= 7 ? 'medio' : 'ok',
    }
  })

  return NextResponse.json({ lotes, total: lotes.length })
}
