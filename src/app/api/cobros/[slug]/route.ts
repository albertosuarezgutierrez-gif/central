export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { resolverComisionConfig } from '@/lib/cobros-comision'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: portal } = await supabase
    .from('cobros_grupo')
    .select(`
      id, titulo, descripcion, estado, imagen_url, color_primario, stripe_connect_id,
      fecha_evento, fecha_limite_pago, repercutir_comision, local_id,
      modo_seleccion, permitir_cantidades, max_seleccion, mensaje_confirmacion,
      restaurantes(nombre, logo_url),
      cobros_grupo_items(id, nombre, descripcion, precio_eur, pdf_url, activo, orden)
    `)
    .eq('slug', slug)
    .single()

  if (!portal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Comisión configurable por restaurante (fallback a defaults de plataforma).
  const { data: cfgRow } = await supabase
    .from('cobro_config')
    .select('comision_pct, comision_fija_eur')
    .eq('local_id', portal.local_id)
    .maybeSingle()
  const cfg = resolverComisionConfig(cfgRow)

  let estado = portal.estado
  if (estado !== 'cerrado' && portal.fecha_limite_pago) {
    const limite = new Date(portal.fecha_limite_pago)
    const esSoloFecha = portal.fecha_limite_pago.length <= 10
    const limiteReal = esSoloFecha ? new Date(limite.getTime() + 86399999) : limite
    if (limiteReal < new Date()) {
      estado = 'cerrado'
      await supabase.from('cobros_grupo').update({ estado: 'cerrado' }).eq('id', portal.id)
    }
  }

  // Los menús se muestran a su precio base. Si el portal repercute la comisión, el
  // cliente calcula y muestra los "gastos de gestión" (% + fijo, una vez por pago) con
  // los datos de `comision`; el cargo real lo itemiza también Stripe en el checkout.
  const items = (portal.cobros_grupo_items as any[])
    .filter((i: any) => i.activo)
    .sort((a: any, b: any) => a.orden - b.orden)
    .map((i: any) => ({
      ...i,
      precio_base_eur: Number(i.precio_eur),
      precio_final_eur: Number(i.precio_eur),
    }))

  return NextResponse.json({
    portal: {
      ...portal,
      estado,
      items,
      comision: {
        repercutir: portal.repercutir_comision === true,
        pct: cfg.pct,
        fija: cfg.fija,
      },
      // defaults para portales creados antes de la migración
      modo_seleccion: portal.modo_seleccion ?? 'una',
      permitir_cantidades: portal.permitir_cantidades ?? false,
      max_seleccion: portal.max_seleccion ?? null,
      mensaje_confirmacion: portal.mensaje_confirmacion ?? null,
    }
  })
}
