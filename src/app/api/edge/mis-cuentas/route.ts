import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()

  // ── Cuentas pendientes: estado='cuenta_pedida' (flujo manual pedir-cuenta)
  //    O tipo='cuenta' (flujo voz: "cuenta mesa cinco") no cerradas
  const { data, error } = await supabase
    .from('comandas')
    .select(`
      id, estado, tipo, created_at, numero_ticket, num_comensales, nombre_cuenta,
      mesa:mesas(id, codigo, capacidad),
      camarero:camareros(id, nombre),
      items:comanda_items(id, nombre, cantidad, precio_unitario, notas, estado)
    `)
    .eq('restaurante_id', session.restaurante_id)
    .or('estado.eq.cuenta_pedida,and(tipo.eq.cuenta,estado.neq.cerrada,estado.neq.cancelada)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type RawItem = { precio_unitario: number | null; cantidad: number }

  // Para comandas tipo='cuenta' (voz) que no tienen items propios,
  // buscar la comanda activa de esa mesa para sacar el total real.
  const sinItems = (data ?? []).filter(
    c => c.tipo === 'cuenta' && (!c.items || (c.items as unknown[]).length === 0) && (c.mesa as {id:string}|null)?.id
  )
  const totalesMesa: Record<string, number> = {}
  if (sinItems.length > 0) {
    const mesaIdSet = new Set<string>()
    for (const c of sinItems) {
      const id = ((c.mesa as { id: string } | null)?.id)
      if (id) mesaIdSet.add(id)
    }
    const mesaIds = [...mesaIdSet]
    for (const mesaId of mesaIds) {
      const { data: orig } = await supabase
        .from('comandas')
        .select('comanda_items(precio_unitario, cantidad)')
        .eq('mesa_id', mesaId)
        .eq('restaurante_id', session.restaurante_id)
        .eq('tipo', 'comanda')
        .not('estado', 'in', '("cerrada","cancelada")')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (orig) {
        const items = (orig.comanda_items ?? []) as RawItem[]
        const key: string = mesaId
        totalesMesa[key] = items.reduce((s, it) => s + (it.precio_unitario ?? 0) * it.cantidad, 0)
      }
    }
  }

  const cuentas = (data ?? []).map(c => {
    const items = (c.items ?? []) as RawItem[]
    const mesaRaw = c.mesa as { id: string } | null
    const mesaId = mesaRaw?.id ?? ''
    const total =
      items.length > 0
        ? items.reduce((s, it) => s + (it.precio_unitario ?? 0) * it.cantidad, 0)
        : (totalesMesa[mesaId] ?? 0)
    const min = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60000)
    return { ...c, total_estimado: total, minutos_esperando: min }
  })

  return NextResponse.json({ cuentas })
}
