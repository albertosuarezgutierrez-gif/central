export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// PATCH /api/comanda/[id]/cancelar
// Cancela una comanda recién creada por voz si el camarero pulsa "Cancelar" en confirm.
// Solo permite cancelar si el camarero es el propietario y la comanda tiene <60s de vida.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })

    const supabase = createServerClient()

    // Verificar que la comanda pertenece al camarero y es muy reciente (<90s)
    const { data: comanda, error: fetchErr } = await supabase
      .from('comandas')
      .select('id, camarero_id, estado, created_at, local_id')
      .eq('id', id)
      .eq('local_id', session.restaurante_id)
      .maybeSingle()

    if (fetchErr || !comanda) {
      return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })
    }

    // Solo el camarero que creó la comanda puede cancelarla
    if (comanda.camarero_id !== session.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Solo cancelar si la comanda tiene menos de 90 segundos (ventana de confirmación)
    const edadMs = Date.now() - new Date(comanda.created_at).getTime()
    if (edadMs > 90_000) {
      return NextResponse.json({ error: 'Comanda demasiado antigua para cancelar desde confirm' }, { status: 409 })
    }

    // No cancelar si ya está cerrada/cobrada
    if (['cerrada', 'cobrada'].includes(comanda.estado)) {
      return NextResponse.json({ error: 'No se puede cancelar una comanda ya cerrada' }, { status: 409 })
    }

    const { error: updateErr } = await supabase
      .from('comandas')
      .update({ estado: 'cancelada' })
      .eq('id', id)
      .eq('local_id', session.restaurante_id)

    if (updateErr) throw updateErr

    // Cancelar también los print_jobs pendientes — evita que cocina reciba el ticket
    // (los ya enviados a la impresora no se pueden recuperar, pero los en cola sí)
    await supabase
      .from('print_jobs')
      .update({ status: 'cancelado' })
      .eq('comanda_id', id)
      .eq('status', 'pendiente')

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
