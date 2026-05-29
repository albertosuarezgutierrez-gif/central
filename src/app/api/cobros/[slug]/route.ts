export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: portal } = await supabase
    .from('cobros_grupo')
    .select(`
      id, titulo, descripcion, estado, imagen_url, color_primario, stripe_connect_id,
      fecha_evento, fecha_limite_pago,
      restaurantes(nombre, logo_url),
      cobros_grupo_items(id, nombre, descripcion, precio_eur, pdf_url, activo, orden)
    `)
    .eq('slug', slug)
    .single()

  if (!portal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Cierre automático por fecha límite
  let estado = portal.estado
  if (estado !== 'cerrado' && portal.fecha_limite_pago) {
    if (new Date(portal.fecha_limite_pago) < new Date()) {
      estado = 'cerrado'
      // Persistir el cierre en BD para que quede registrado
      await supabase
        .from('cobros_grupo')
        .update({ estado: 'cerrado' })
        .eq('id', portal.id)
    }
  }

  return NextResponse.json({
    portal: {
      ...portal,
      estado,
      items: (portal.cobros_grupo_items as any[])
        .filter((i: any) => i.activo)
        .sort((a: any, b: any) => a.orden - b.orden)
    }
  })
}
