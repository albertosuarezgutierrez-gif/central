export const dynamic = 'force-dynamic'

// ============================================================
// ia.rest · PATCH /api/comanda/[id]/mesa
// ============================================================
// Cambia la mesa de una comanda activa (ej: T1 → T3).
// · Libera mesa origen, ocupa mesa destino
// · Actualiza zona_nombre en la comanda
// · Invalida sesión QR activa en mesa origen
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: comanda_id } = await params
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)

  if (!comanda_id) {
    return NextResponse.json({ error: 'comanda_id requerido' }, { status: 400 })
  }

  const { mesa_destino_id } = await req.json()
  if (!mesa_destino_id) {
    return NextResponse.json({ error: 'mesa_destino_id requerido' }, { status: 400 })
  }

  // -- 1. Verificar comanda -------------------------
  const { data: comanda, error: errComanda } = await supabase
    .from('comandas')
    .select('id, mesa_id, estado')
    .eq('id', comanda_id)
    .eq('restaurante_id', restaurante_id)
    .single()

  if (!comanda || errComanda) {
    return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })
  }

  if (comanda.estado === 'cerrada') {
    return NextResponse.json({ error: 'No se puede mover una comanda cerrada' }, { status: 400 })
  }

  if (comanda.mesa_id === mesa_destino_id) {
    return NextResponse.json({ error: 'La mesa destino es la misma que la origen' }, { status: 400 })
  }

  // -- 2. Verificar mesa destino libre -------------
  const { data: mesaDestino } = await supabase
    .from('mesas')
    .select('id, codigo, estado, zona_id, zonas(nombre)')
    .eq('id', mesa_destino_id)
    .eq('restaurante_id', restaurante_id)
    .single()

  if (!mesaDestino) {
    return NextResponse.json({ error: 'Mesa destino no encontrada' }, { status: 404 })
  }

  if (mesaDestino.estado !== 'libre' && mesaDestino.estado !== 'disponible') {
    return NextResponse.json(
      { error: `${mesaDestino.codigo} no está libre (estado: ${mesaDestino.estado})` },
      { status: 409 }
    )
  }

  const mesa_origen_id = comanda.mesa_id
  const zona_nombre_nueva = (mesaDestino.zonas as { nombre?: string } | null)?.nombre ?? null

  // -- 3. Actualizar comanda -----------------------
  const { error: errComandaUpdate } = await supabase
    .from('comandas')
    .update({
      mesa_id: mesa_destino_id,
      zona_nombre: zona_nombre_nueva,
    })
    .eq('id', comanda_id)
    .eq('restaurante_id', restaurante_id)

  if (errComandaUpdate) {
    console.error('[CAMBIO-MESA] Error update comanda:', errComandaUpdate)
    return NextResponse.json({ error: 'Error actualizando comanda' }, { status: 500 })
  }

  // -- 4. Liberar mesa origen ----------------------
  if (mesa_origen_id) {
    await supabase
      .from('mesas')
      .update({ estado: 'libre', camarero_id: null })
      .eq('id', mesa_origen_id)
      .eq('restaurante_id', restaurante_id)
  }

  // -- 5. Ocupar mesa destino ----------------------
  await supabase
    .from('mesas')
    .update({ estado: 'ocupada' })
    .eq('id', mesa_destino_id)
    .eq('restaurante_id', restaurante_id)

  // -- 6. Invalidar QR activo en mesa origen -------
  if (mesa_origen_id) {
    await supabase
      .from('qr_sesiones_cliente')
      .update({ estado: 'expirada' })
      .eq('mesa_id', mesa_origen_id)
      .eq('restaurante_id', restaurante_id)
      .eq('estado', 'activa')
  }

  console.log(`[CAMBIO-MESA] Comanda ${comanda_id} movida a ${mesaDestino.codigo}`)

  return NextResponse.json({
    ok: true,
    mesa_nueva: mesaDestino.codigo,
    zona_nombre: zona_nombre_nueva,
  })
}
