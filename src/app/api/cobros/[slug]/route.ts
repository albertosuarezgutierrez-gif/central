export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const COMISION_TOTAL = 0.025 // 1.5% Stripe + 1% ia.rest

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: portal } = await supabase
    .from('cobros_grupo')
    .select(`
      id, titulo, descripcion, estado, imagen_url, color_primario, stripe_connect_id,
      fecha_evento, fecha_limite_pago, repercutir_comision,
      restaurantes(nombre, logo_url),
      cobros_grupo_items(id, nombre, descripcion, precio_eur, pdf_url, activo, orden)
    `)
    .eq('slug', slug)
    .single()

  if (!portal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Cierre automático por fecha límite
  // fecha_limite_pago puede venir como TIMESTAMPTZ o solo fecha (YYYY-MM-DD)
  // Si viene solo fecha, no cerrar hasta fin del día para evitar cierre prematuro por UTC
  let estado = portal.estado
  if (estado !== 'cerrado' && portal.fecha_limite_pago) {
    const limite = new Date(portal.fecha_limite_pago)
    const esSoloFecha = portal.fecha_limite_pago.length <= 10
    // Si es solo fecha, añadir 24h-1ms para cubrir todo el día en cualquier zona horaria
    const limiteReal = esSoloFecha ? new Date(limite.getTime() + 86399999) : limite
    if (limiteReal < new Date()) {
      estado = 'cerrado'
      await supabase.from('cobros_grupo').update({ estado: 'cerrado' }).eq('id', portal.id)
    }
  }

  // Calcular precio final visible según configuración de comisión
  const items = (portal.cobros_grupo_items as any[])
    .filter((i: any) => i.activo)
    .sort((a: any, b: any) => a.orden - b.orden)
    .map((i: any) => ({
      ...i,
      precio_base_eur: Number(i.precio_eur),
      precio_final_eur: portal.repercutir_comision
        ? Math.round(Number(i.precio_eur) * (1 + COMISION_TOTAL) * 100) / 100
        : Number(i.precio_eur)
    }))

  return NextResponse.json({
    portal: { ...portal, estado, items }
  })
}
