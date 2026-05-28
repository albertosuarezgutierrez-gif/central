export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: portal } = await supabase
    .from('cobros_grupo')
    .select(`
      id, titulo, descripcion, estado, stripe_connect_id,
      restaurantes(nombre, logo_url),
      cobros_grupo_items(id, nombre, descripcion, precio_eur, pdf_url, activo, orden)
    `)
    .eq('slug', slug)
    .single()

  if (!portal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  return NextResponse.json({
    portal: {
      ...portal,
      items: (portal.cobros_grupo_items as any[])
        .filter((i: any) => i.activo)
        .sort((a: any, b: any) => a.orden - b.orden)
    }
  })
}
