export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * PATCH /api/kds/elaboraciones/[id]
 * Body: { estado?, etiqueta_impresa? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { estado, etiqueta_impresa } = await req.json()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (estado) updates.estado = estado
  if (etiqueta_impresa) {
    updates.etiqueta_impresa_at = new Date().toISOString()
    updates.etiqueta_impresa_veces = supabase // incrementar
  }

  // Contar impresiones actuales si necesario
  if (etiqueta_impresa) {
    const { data: actual } = await supabase
      .from('elaboraciones_propias')
      .select('etiqueta_impresa_veces')
      .eq('id', id)
      .eq('local_id', rid)
      .single()

    updates.etiqueta_impresa_at = new Date().toISOString()
    updates.etiqueta_impresa_veces = (actual?.etiqueta_impresa_veces ?? 0) + 1
  }

  const { data, error } = await supabase
    .from('elaboraciones_propias')
    .update(updates)
    .eq('id', id)
    .eq('local_id', rid)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si se marca como consumida → push al jefe de cocina
  if (estado === 'consumida') {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.iarest.es'
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify({ restaurante_id: rid }) },
      body: JSON.stringify({
        restaurante_id: rid,
        roles: ['cocina', 'jefe_sala'],
        title: '✅ Elaboración consumida',
        body: `${data.nombre} (lote ${data.lote}) marcada como consumida.`,
        data: { tipo: 'elaboracion_consumida', elaboracion_id: id },
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, elaboracion: data })
}
