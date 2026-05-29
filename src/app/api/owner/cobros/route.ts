export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { data, error } = await supabase
    .from('cobros_grupo')
    .select(`
      id, slug, titulo, descripcion, estado, imagen_url, color_primario,
      fecha_evento, fecha_limite_pago, created_at,
      cobros_grupo_items(id, nombre, precio_eur, pdf_url, activo, orden),
      cobros_grupo_pagos(id, estado, importe_eur, nombre_pagador, email_pagador, pagado_at)
    `)
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ portales: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const body = await req.json()
  const { titulo, descripcion, items, imagen_url, color_primario, fecha_evento, fecha_limite_pago, repercutir_comision } = body

  if (!titulo?.trim()) return NextResponse.json({ error: 'Título requerido' }, { status: 400 })
  if (!items?.length) return NextResponse.json({ error: 'Al menos un menú requerido' }, { status: 400 })

  // Generar slug único
  const base = titulo.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const slug = `${base}-${Date.now().toString(36)}`

  // Obtener stripe_connect_id del restaurante
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('configuracion')
    .eq('id', rid)
    .single()
  const stripeConnectId = rest?.configuracion?.stripe_connect_id ?? null

  const { data: portal, error: portalErr } = await supabase
    .from('cobros_grupo')
    .insert({
      restaurante_id: rid,
      slug,
      titulo,
      descripcion: descripcion || null,
      stripe_connect_id: stripeConnectId,
      imagen_url: imagen_url || null,
      color_primario: color_primario || '#D9442B',
      fecha_evento: fecha_evento || null,
      fecha_limite_pago: fecha_limite_pago || null,
      repercutir_comision: repercutir_comision === true,
    })
    .select('id, slug')
    .single()

  if (portalErr) return NextResponse.json({ error: portalErr.message }, { status: 500 })

  // Insertar ítems
  const itemsToInsert = items
    .filter((i: any) => i.nombre?.trim() && parseFloat(i.precio_eur) > 0)
    .map((i: any, idx: number) => ({
      cobro_grupo_id: portal.id,
      nombre: i.nombre.trim(),
      descripcion: i.descripcion || null,
      precio_eur: parseFloat(i.precio_eur),
      pdf_url: i.pdf_url || null,
      orden: idx
    }))

  if (itemsToInsert.length) {
    await supabase.from('cobros_grupo_items').insert(itemsToInsert)
  }

  return NextResponse.json({ ok: true, slug: portal.slug, id: portal.id })
}
