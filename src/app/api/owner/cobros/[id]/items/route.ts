export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { resolverComisionConfig } from '@/lib/cobros-comision'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  // Verificar que el portal pertenece al restaurante
  const { data: portal } = await supabase
    .from('cobros_grupo')
    .select('id')
    .eq('id', id)
    .eq('restaurante_id', rid)
    .single()
  if (!portal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { items } = await req.json() as {
    items: Array<{ id: string; nombre: string; precio_eur: number; pdf_url: string | null }>
  }

  // Mínimo por producto (configurable por restaurante, con default de plataforma)
  const { data: cfgRow } = await supabase
    .from('cobro_config').select('minimo_producto_eur').eq('restaurante_id', rid).maybeSingle()
  const { minimo } = resolverComisionConfig(cfgRow)
  if (items.some(i => Number(i.precio_eur) < minimo)) {
    return NextResponse.json({ error: `El precio mínimo por menú es ${minimo.toFixed(2)} €` }, { status: 400 })
  }

  // Actualizar cada ítem individualmente
  const updates = await Promise.allSettled(
    items.map(item =>
      supabase
        .from('cobros_grupo_items')
        .update({ nombre: item.nombre, precio_eur: item.precio_eur, pdf_url: item.pdf_url })
        .eq('id', item.id)
        .eq('cobro_grupo_id', id)
    )
  )

  const failed = updates.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error))
  if (failed.length > 0) return NextResponse.json({ error: 'Error actualizando algún ítem' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
