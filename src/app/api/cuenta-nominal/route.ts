import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

// GET /api/cuenta-nominal — lista cuentas nominales abiertas en el turno activo
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    const { data: turno } = await supabase
      .from('turnos').select('id')
      .eq('restaurante_id', rid).eq('estado', 'activo')
      .single()
    if (!turno) return NextResponse.json({ cuentas: [] })

    // Traer todas las comandas nominales abiertas en este turno
    const { data: comandas, error } = await supabase
      .from('comandas')
      .select(`
        id, nombre_cuenta, tipo, estado, created_at, camarero_id,
        comanda_items(nombre, cantidad, precio_unitario, notas)
      `)
      .eq('restaurante_id', rid)
      .eq('turno_id', turno.id)
      .not('nombre_cuenta', 'is', null)
      .not('estado', 'in', '(cerrada,cancelada)')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Agrupar por nombre_cuenta
    const mapa: Record<string, {
      nombre: string
      comandas: { id: string; created_at: string; items: { nombre: string; cantidad: number; precio_unitario: number | null; notas: string | null }[] }[]
      total: number
      ultima_actividad: string
      num_items: number
    }> = {}

    for (const c of (comandas ?? [])) {
      const nombre = c.nombre_cuenta as string
      if (!mapa[nombre]) {
        mapa[nombre] = { nombre, comandas: [], total: 0, ultima_actividad: c.created_at, num_items: 0 }
      }
      const items = (c.comanda_items as { nombre: string; cantidad: number; precio_unitario: number | null; notas: string | null }[]) ?? []
      mapa[nombre].comandas.push({ id: c.id, created_at: c.created_at, items })
      mapa[nombre].total += items.reduce((s, i) => s + (i.precio_unitario ?? 0) * i.cantidad, 0)
      mapa[nombre].num_items += items.reduce((s, i) => s + i.cantidad, 0)
      if (c.created_at > mapa[nombre].ultima_actividad) mapa[nombre].ultima_actividad = c.created_at
    }

    const cuentas = Object.values(mapa).sort((a, b) =>
      new Date(b.ultima_actividad).getTime() - new Date(a.ultima_actividad).getTime()
    )

    return NextResponse.json({ cuentas })
  } catch (err) {
    console.error('[CUENTA-NOMINAL GET]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

// DELETE /api/cuenta-nominal — cierra (marca cerradas) todas las comandas de un nombre en el turno
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const { nombre_cuenta } = await req.json()
    if (!nombre_cuenta) return NextResponse.json({ error: 'nombre_cuenta requerido' }, { status: 400 })

    const { data: turno } = await supabase
      .from('turnos').select('id')
      .eq('restaurante_id', rid).eq('estado', 'activo')
      .single()
    if (!turno) return NextResponse.json({ error: 'Sin turno activo' }, { status: 400 })

    await supabase.from('comandas')
      .update({ estado: 'cerrada' })
      .eq('restaurante_id', rid)
      .eq('turno_id', turno.id)
      .eq('nombre_cuenta', nombre_cuenta)
      .not('estado', 'in', '(cerrada,cancelada)')

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
