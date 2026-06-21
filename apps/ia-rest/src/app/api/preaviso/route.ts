// ============================================================
// /api/preaviso — Preaviso de marcha cocina ⇄ sala
//
// POST  { comanda_id }                 → cocina crea el preaviso (gated, dedup, push)
// PATCH { preaviso_id, accion }        → sala confirma 'mesa_lista' | 'cancelar'
//
// Multi-tenant: todas las queries filtran por el restaurante de la sesión.
// El flag restaurantes.preaviso_activo gobierna todo (403 si está off).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSession, getRestauranteId } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { resumenPlatos, textoPreaviso, type PlatoLinea } from '@/lib/preaviso'
import { enviarPushACamarero } from '@/lib/push'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { comanda_id } = await req.json() as { comanda_id?: string }
  if (!comanda_id) return NextResponse.json({ error: 'comanda_id requerido' }, { status: 400 })

  // 1) Gate de configuración: si el dueño no lo activó, 403
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('preaviso_activo')
    .eq('id', restauranteId)
    .single()
  if (!rest?.preaviso_activo) {
    return NextResponse.json({ error: 'Preaviso desactivado' }, { status: 403 })
  }

  // 2) Cargar comanda + mesa + camarero asignado (filtrando por restaurante)
  const { data: comanda } = await supabase
    .from('comandas')
    .select('id, camarero_id, local_id, estado, mesa:mesas(codigo, nombre)')
    .eq('id', comanda_id)
    .eq('local_id', restauranteId)
    .maybeSingle()
  if (!comanda) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })

  // mesas(...) puede llegar como objeto o array según la inferencia del cliente
  const mesaRel = Array.isArray((comanda as { mesa?: unknown }).mesa)
    ? (comanda as { mesa: Array<{ codigo?: string; nombre?: string }> }).mesa[0]
    : (comanda as { mesa?: { codigo?: string; nombre?: string } }).mesa
  const mesa = String(mesaRel?.nombre ?? mesaRel?.codigo ?? '')

  // 3) Snapshot de los platos de la comanda
  const { data: items } = await supabase
    .from('comanda_items')
    .select('nombre, cantidad')
    .eq('comanda_id', comanda_id)
  const platos = resumenPlatos((items ?? []) as PlatoLinea[])

  // 4) Insertar (el índice único uq_preavisos_comanda_enviado garantiza el dedup)
  const { data: preaviso, error } = await supabase
    .from('preavisos')
    .insert({
      restaurante_id: restauranteId,
      comanda_id,
      mesa,
      platos,
      emitido_por: session.rol ?? 'cocina',
      estado: 'enviado',
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation → ya hay un preaviso activo para esta comanda
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, dedup: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 5) Push al camarero asignado (no romper el flujo si falla el push;
  //    el banner Realtime en /edge cubre el caso de push caído)
  if (comanda.camarero_id) {
    try {
      await enviarPushACamarero({
        supabase,
        localId: restauranteId,
        camareroId: comanda.camarero_id,
        title: 'Preaviso de marcha',
        body: textoPreaviso(mesa, platos),
        data: { url: '/edge', tipo: 'preaviso', preaviso_id: preaviso.id },
      })
    } catch { /* no crítico */ }
  }

  return NextResponse.json({ ok: true, preaviso })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { preaviso_id, accion } = await req.json() as {
    preaviso_id?: string
    accion?: 'mesa_lista' | 'cancelar'
  }
  if (!preaviso_id) return NextResponse.json({ error: 'preaviso_id requerido' }, { status: 400 })

  const nuevoEstado = accion === 'cancelar' ? 'cancelado' : 'mesa_lista'
  const patch: Record<string, unknown> = { estado: nuevoEstado }
  if (nuevoEstado === 'mesa_lista') {
    patch.mesa_lista_at = new Date().toISOString()
    patch.mesa_lista_por = session.camarero_id ?? null
  }

  const { data, error } = await supabase
    .from('preavisos')
    .update(patch)
    .eq('id', preaviso_id)
    .eq('restaurante_id', restauranteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // El UPDATE viaja por Realtime al canal kds-{restaurante_id} → cocina lo ve.
  return NextResponse.json({ ok: true, preaviso: data })
}
