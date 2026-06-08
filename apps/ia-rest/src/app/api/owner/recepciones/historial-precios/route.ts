export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/owner/recepciones/historial-precios?articulo_ids=uuid1,uuid2
 * Devuelve el último precio facturado + media 90d por artículo de stock.
 * Usado en la checklist de recepción para detectar subidas de precio.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const ids = req.nextUrl.searchParams.get('articulo_ids')?.split(',').filter(Boolean) ?? []
  if (!ids.length) return NextResponse.json({ precios: {} })

  // Para cada artículo: precio de la última recepción confirmada + media 90 días
  const { data, error } = await supabase
    .from('recepcion_items')
    .select(`
      stock_articulo_id,
      precio_facturado,
      recepciones_mercancia!inner(estado, fecha_recepcion, local_id)
    `)
    .eq('recepciones_mercancia.local_id', rid)
    .eq('recepciones_mercancia.estado', 'confirmada')
    .in('stock_articulo_id', ids)
    .not('precio_facturado', 'is', null)
    .order('recepciones_mercancia(fecha_recepcion)', { ascending: false })

  if (error) return NextResponse.json({ precios: {} })

  const ahora = new Date()
  const hace90 = new Date(ahora.getTime() - 90 * 24 * 60 * 60 * 1000)

  // Agrupar por articulo_id
  const map: Record<string, { ultimo: number; media90: number | null; muestras: number }> = {}

  for (const row of data ?? []) {
    const aid = row.stock_articulo_id as string
    const precio = row.precio_facturado as number
    const fecha = new Date(((row.recepciones_mercancia as unknown) as { fecha_recepcion: string }).fecha_recepcion)

    if (!map[aid]) {
      map[aid] = { ultimo: precio, media90: null, muestras: 0 }
    }
    if (fecha >= hace90) {
      if (map[aid].media90 === null) map[aid].media90 = 0
      map[aid].media90 = (map[aid].media90! * map[aid].muestras + precio) / (map[aid].muestras + 1)
      map[aid].muestras++
    }
  }

  return NextResponse.json({ precios: map })
}
