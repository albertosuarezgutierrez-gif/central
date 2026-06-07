export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mesa_id } = await params
    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    const { data: comanda, error } = await supabase
      .from('comandas')
      .select(`
        id, estado, tipo, created_at, numero_ticket,
        num_comensales, total_cobrado, estado_cobro,
        camarero:camareros(id, nombre),
        items:comanda_items(
          id, nombre, cantidad, notas, estado,
          precio_unitario, formato_nombre, created_at
        )
      `)
      .eq('mesa_id', mesa_id)
      .eq('local_id', rid)
      .in('estado', ['nueva', 'en_cocina', 'cuenta', 'cuenta_pedida'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!comanda) return NextResponse.json({ comanda: null })

    type RawItem = { id:string; nombre:string; cantidad:number; notas:string|null; estado:string; precio_unitario:number|null; formato_nombre:string|null; created_at:string }
    const items = comanda.items as RawItem[]

    // Enriquecer items sin precio buscando en la carta
    const sinPrecio = items.filter(it => it.precio_unitario == null)
    if (sinPrecio.length > 0) {
      const nombres = [...new Set(sinPrecio.map(it => it.nombre))]
      const { data: prods } = await supabase
        .from('productos').select('nombre, precio')
        .in('nombre', nombres).eq('local_id', rid)

      const precioMap: Record<string, number> = {}
      for (const p of prods ?? []) {
        if (p.precio != null) precioMap[p.nombre] = Number(p.precio)
      }
      for (const it of items) {
        if (it.precio_unitario == null && precioMap[it.nombre] != null) {
          it.precio_unitario = precioMap[it.nombre]
        }
      }
    }

    const total = items.reduce((acc, it) => acc + (it.precio_unitario ?? 0) * it.cantidad, 0)
    const minutos = Math.floor((Date.now() - new Date(comanda.created_at).getTime()) / 60000)

    return NextResponse.json({ comanda: { ...comanda, items, total_estimado: total, minutos_abierta: minutos } })
  } catch (err) {
    console.error('[MESA COMANDA]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
