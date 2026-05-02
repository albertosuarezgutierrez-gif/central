import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await sb()
    .from('impresoras')
    .select('id, nombre, seccion_id, cloud_device_id, modelo, activa, ultimo_ping, configurada, connection_type, ip_address, port')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ impresoras: data })
}

export async function POST(req: NextRequest) {
  const { nombre, seccion_id, cloud_device_id, modelo } = await req.json()
  if (!nombre || !seccion_id || !cloud_device_id)
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  const { data, error } = await sb()
    .from('impresoras')
    .insert({ nombre, seccion_id, cloud_device_id: cloud_device_id.trim().toUpperCase(),
      modelo: modelo || null, connection_type: 'epson_epos', activa: true, configurada: true })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ impresora: data })
}

export async function PATCH(req: NextRequest) {
  const { id, ...fields } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const allowed = ['nombre', 'seccion_id', 'cloud_device_id', 'activa', 'modelo', 'ip_address', 'port', 'connection_type']
  const update = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)))
  const { data, error } = await sb().from('impresoras').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ impresora: data })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await sb().from('impresoras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
