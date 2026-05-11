import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRestauranteId } from '@/lib/session'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const rid = getRestauranteId(req)
  const { data, error } = await sb()
    .from('impresoras')
    .select('id, nombre, seccion_id, cloud_device_id, modelo, activa, ultimo_ping, configurada, connection_type, ip_address, port')
    .eq('restaurante_id', rid)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ impresoras: data })
}

export async function POST(req: NextRequest) {
  const rid = getRestauranteId(req)
  const { nombre, seccion_id, cloud_device_id, ip_address, port, connection_type, modelo } = await req.json()
  if (!nombre || !seccion_id) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const isTCP = connection_type === 'tcp' || connection_type === 'ip_local' || (!cloud_device_id && ip_address)
  if (isTCP && !ip_address) return NextResponse.json({ error: 'IP requerida para ESC/POS TCP' }, { status: 400 })
  if (!isTCP && !cloud_device_id) return NextResponse.json({ error: 'Device ID requerido para CloudPRNT' }, { status: 400 })

  const row: Record<string, unknown> = {
    nombre, seccion_id, restaurante_id: rid,
    modelo: modelo || null, activa: true, configurada: true,
    connection_type: isTCP ? 'ip_local' : 'epson_epos',
  }
  if (isTCP) {
    row.ip_address = ip_address.trim()
    row.port = port ? Number(port) : 9100
  } else {
    row.cloud_device_id = cloud_device_id.trim().toUpperCase()
  }

  const { data, error } = await sb().from('impresoras').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ impresora: data })
}

export async function PATCH(req: NextRequest) {
  const rid = getRestauranteId(req)
  const { id, ...fields } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const allowed = ['nombre', 'seccion_id', 'cloud_device_id', 'activa', 'modelo', 'ip_address', 'port', 'connection_type']
  const update = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)))
  const { data, error } = await sb().from('impresoras').update(update).eq('id', id).eq('restaurante_id', rid).select().single()
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
