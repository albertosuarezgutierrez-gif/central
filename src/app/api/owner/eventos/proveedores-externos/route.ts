import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { data, error } = await supabase.from('proveedores_evento').select('*').eq('restaurante_id', restauranteId).eq('activo', true).order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ proveedores: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  const { data, error } = await supabase.from('proveedores_evento').insert({
    restaurante_id: restauranteId, nombre: body.nombre, tipo: body.tipo ?? 'otro',
    contacto_nombre: body.contacto_nombre ?? null, contacto_telefono: body.contacto_telefono ?? null,
    contacto_email: body.contacto_email ?? null, web: body.web ?? null, notas: body.notas ?? null,
    comision_pct: body.comision_pct ?? 0, iva_tipo: body.iva_tipo ?? 21, portal_activo: body.portal_activo ?? false,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (body.portal_activo && body.contacto_email && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const url = `${process.env.NEXT_PUBLIC_URL ?? 'https://www.iarest.es'}/proveedor/${data.token_portal}`
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'ia.rest <eventos@iarest.es>', to: body.contacto_email,
        subject: 'Acceso a tu portal de proveedor — ia.rest',
        html: `<p>Hola ${body.contacto_nombre ?? body.nombre},</p><p><a href="${url}">Acceder al portal →</a></p>`,
      })
    } catch (e) { console.error('Email proveedor:', e) }
  }
  return NextResponse.json({ ok: true, proveedor: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...updates } = await req.json()
  const { error } = await supabase.from('proveedores_evento').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).eq('restaurante_id', restauranteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  await supabase.from('proveedores_evento').update({ activo: false }).eq('id', id).eq('restaurante_id', restauranteId)
  return NextResponse.json({ ok: true })
}
