import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const blog = searchParams.get('blog')

  if (blog === 'true') {
    const { data } = await supabase
      .from('v_proveedores_blog')
      .select('*')
      .order('fecha', { ascending: false })
    return NextResponse.json(data ?? [])
  }

  if (id) {
    const [{ data: proveedor }, { data: contactos }, { data: comms }] = await Promise.all([
      supabase.from('proveedores_tech').select('*').eq('id', id).single(),
      supabase.from('proveedores_tech_contactos').select('*').eq('proveedor_id', id).order('created_at'),
      supabase.from('proveedores_tech_comunicaciones').select('*').eq('proveedor_id', id).order('fecha', { ascending: false }),
    ])
    return NextResponse.json({ proveedor, contactos, comms })
  }

  const { data } = await supabase
    .from('proveedores_tech')
    .select('*, proveedores_tech_contactos(id, nombre, cargo, email)')
    .order('categoria')
    .order('nombre')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { accion, ...payload } = body

  if (accion === 'upsert_proveedor') {
    const { id, ...fields } = payload
    if (id) {
      const { data } = await supabase
        .from('proveedores_tech')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      return NextResponse.json(data)
    }
    const { data } = await supabase
      .from('proveedores_tech').insert(fields).select().single()
    return NextResponse.json(data)
  }

  if (accion === 'upsert_contacto') {
    const { id, ...fields } = payload
    if (id) {
      const { data } = await supabase
        .from('proveedores_tech_contactos')
        .update(fields).eq('id', id).select().single()
      return NextResponse.json(data)
    }
    const { data } = await supabase
      .from('proveedores_tech_contactos').insert(fields).select().single()
    return NextResponse.json(data)
  }

  if (accion === 'add_comunicacion') {
    const { data } = await supabase
      .from('proveedores_tech_comunicaciones')
      .insert(payload).select().single()
    return NextResponse.json(data)
  }

  if (accion === 'toggle_blog_com') {
    const { id, util_blog } = payload
    await supabase
      .from('proveedores_tech_comunicaciones')
      .update({ util_blog }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (accion === 'toggle_blog_notas') {
    const { id, util_blog_notas } = payload
    await supabase
      .from('proveedores_tech')
      .update({ util_blog_notas }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (accion === 'delete_contacto') {
    await supabase.from('proveedores_tech_contactos').delete().eq('id', payload.id)
    return NextResponse.json({ ok: true })
  }

  if (accion === 'delete_comunicacion') {
    await supabase.from('proveedores_tech_comunicaciones').delete().eq('id', payload.id)
    return NextResponse.json({ ok: true })
  }

  if (accion === 'resumen_ia') {
    const { callAI } = await import('@/lib/ai-client')
    const { data: comms } = await supabase
      .from('proveedores_tech_comunicaciones')
      .select('tipo, fecha, asunto, resumen, cuerpo')
      .eq('proveedor_id', payload.proveedor_id)
      .order('fecha', { ascending: false })
      .limit(20)

    if (!comms?.length) return NextResponse.json({ resumen: 'Sin comunicaciones registradas.' })

    const texto = comms.map((c: { tipo: string; fecha: string; asunto?: string; resumen?: string; cuerpo?: string }) =>
      `[${c.tipo.toUpperCase()} ${new Date(c.fecha).toLocaleDateString('es')}] ${c.asunto ?? ''}\n${c.resumen || c.cuerpo || ''}`
    ).join('\n\n')

    const resumen = await callAI(
      'Eres un asistente de negocio. Resume en 3-5 puntos clave las comunicaciones con este proveedor: estado actual, acuerdos alcanzados, pendientes, próximos pasos. Sé conciso.',
      texto, 600
    )
    return NextResponse.json({ resumen })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
