export const dynamic = 'force-dynamic'

// GET + POST /api/comanda/[id]/item
// GET  → lista items de la comanda (para desglose ticket)
// POST → añade items a una comanda existente + registra en audit_log + crea print_job

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'
import { crearPrintJobs } from '@/lib/courier'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: comanda_id } = await params
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase
    .from('comanda_items')
    .select('id, nombre, cantidad, precio_unitario, notas')
    .eq('comanda_id', comanda_id)
    .eq('local_id', rid)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: comanda_id } = await params
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    const { items } = await req.json() as {
      items: { nombre: string; cantidad: number; notas?: string; precio_unitario?: number; producto_id?: string; formato_id?: string; formato_nombre?: string; seccion_id?: string }[]
    }
    if (!items?.length) return NextResponse.json({ error: 'items requeridos' }, { status: 400 })

    // Verificar que la comanda pertenece al restaurante
    const { data: comanda } = await supabase
      .from('comandas')
      .select('id, estado, tipo, numero_ticket, nombre_cuenta, nota_general, mesa_id, camarero_id')
      .eq('id', comanda_id).eq('local_id', rid).single()
    if (!comanda) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })

    // Insertar items
    const insertados = await supabase.from('comanda_items').insert(
      items.map(it => ({
        comanda_id, restaurante_id: rid,
        nombre: it.nombre, cantidad: it.cantidad,
        notas: it.notas ?? null,
        precio_unitario: it.precio_unitario ?? null,
        producto_id: it.producto_id ?? null,
        formato_id: it.formato_id ?? null,
        formato_nombre: it.formato_nombre ?? null,
        seccion_id: it.seccion_id ?? null,
      }))
    ).select()

    // Audit log por cada item añadido
    for (const it of items) {
      await supabase.rpc('log_comanda_accion', {
        p_comanda_id: comanda_id, p_camarero_id: session.id,
        p_accion: 'añadir_item', p_item_nombre: it.nombre,
        p_cant_antes: 0, p_cant_despues: it.cantidad,
      })
    }

    // Print_job: imprimir ticket de los nuevos items en cocina
    // El KDS los ve por Realtime, pero sin ticket impreso en restaurantes con mucho tráfico
    // se pierden fácilmente. Imprimimos solo los items nuevos (no toda la comanda).
    try {
      let mesaCodigo = comanda.nombre_cuenta ? `★ ${comanda.nombre_cuenta}` : '?'
      let zonaTipo: string | null = null
      let zonaNombre: string | null = null

      if (comanda.mesa_id) {
        const { data: mesa } = await supabase
          .from('mesas').select('codigo, zona, zonas(nombre)')
          .eq('id', comanda.mesa_id).eq('local_id', rid).single()
        if (mesa) {
          mesaCodigo = mesa.codigo
          zonaTipo   = (mesa as Record<string, unknown>).zona as string ?? null
          zonaNombre = ((mesa as Record<string, unknown>).zonas as { nombre?: string } | null)?.nombre ?? null
        }
      }

      const { data: cam } = await supabase.from('personal').select('nombre').eq('id', comanda.camarero_id).single()

      await crearPrintJobs(
        {
          id:              comanda_id,
          tipo:            'comanda',
          mesa_codigo:     mesaCodigo,
          camarero_nombre: cam?.nombre ?? session.nombre ?? 'Equipo',
          numero_ticket:   comanda.numero_ticket ?? undefined,
          restaurante_id:  rid,
          zona_tipo:       zonaTipo,
          zona_nombre:     zonaNombre,
          nota_general:    comanda.nota_general ?? null,
        },
        items.map(it => ({
          nombre:         it.nombre,
          cantidad:       it.cantidad,
          notas:          it.notas ?? null,
          seccion_id:     it.seccion_id ?? null,
          formato_nombre: it.formato_nombre ?? null,
        }))
      )
    } catch (e) {
      // No bloquear la respuesta si falla la impresión — los items ya están en BD/KDS
      console.error('[COMANDA ITEM] Print error:', e)
    }

    return NextResponse.json({ ok: true, items: insertados.data })
  } catch (err) {
    console.error('[COMANDA ITEM POST]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
