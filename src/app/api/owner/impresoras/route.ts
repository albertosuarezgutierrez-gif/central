import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

const sb = () => createServerClient()

export async function GET(req: NextRequest) {
  const rid = getRestauranteId(req)
  const { data, error } = await sb()
    .from('impresoras')
    .select('id, nombre, seccion_id, secciones_ids, cloud_device_id, modelo, activa, ultimo_ping, configurada, connection_type, ip_address, port, impresora_fallback_id')
    .eq('restaurante_id', rid)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Normalizar: si secciones_ids está vacío, rellenar desde seccion_id legacy
  const normalized = (data ?? []).map(imp => ({
    ...imp,
    secciones_ids: imp.secciones_ids?.length > 0
      ? imp.secciones_ids
      : (imp.seccion_id ? [imp.seccion_id] : []),
  }))
  return NextResponse.json({ impresoras: normalized })
}

export async function POST(req: NextRequest) {
  const rid = getRestauranteId(req)
  const { nombre, secciones_ids, seccion_id: seccionLegacy, cloud_device_id, ip_address, port, connection_type, modelo } = await req.json()

  // Resolver secciones: preferir secciones_ids (array) sobre seccion_id legacy
  const secciones: string[] = secciones_ids?.length > 0
    ? secciones_ids
    : (seccionLegacy ? [seccionLegacy] : [])

  if (!nombre || secciones.length === 0) {
    return NextResponse.json({ error: 'Nombre y al menos una sección son requeridos' }, { status: 400 })
  }

  const isTCP = connection_type === 'tcp' || connection_type === 'ip_local' || (!cloud_device_id && ip_address)
  if (isTCP && !ip_address) return NextResponse.json({ error: 'IP requerida para ESC/POS TCP' }, { status: 400 })
  if (!isTCP && !cloud_device_id) return NextResponse.json({ error: 'Device ID requerido para CloudPRNT' }, { status: 400 })

  const row: Record<string, unknown> = {
    nombre,
    seccion_id:    secciones[0],   // campo legacy = primera sección
    secciones_ids: secciones,
    restaurante_id: rid,
    modelo: modelo || null,
    activa: true,
    configurada: true,
    connection_type: isTCP ? 'ip_local' : 'star_cloudprnt',
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
  const { id, secciones_ids, seccion_id: seccionLegacy, ...fields } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const allowed = ['nombre', 'cloud_device_id', 'activa', 'modelo', 'ip_address', 'port', 'connection_type', 'impresora_fallback_id']
  const update: Record<string, unknown> = Object.fromEntries(
    Object.entries(fields).filter(([k]) => allowed.includes(k))
  )

  // Actualizar secciones si se proporcionaron
  if (secciones_ids !== undefined) {
    const secciones: string[] = secciones_ids?.length > 0
      ? secciones_ids
      : (seccionLegacy ? [seccionLegacy] : [])
    update.secciones_ids = secciones
    update.seccion_id    = secciones[0] ?? null  // mantener legacy sync
  } else if (seccionLegacy !== undefined) {
    update.seccion_id    = seccionLegacy
    update.secciones_ids = seccionLegacy ? [seccionLegacy] : []
  }

  const { data, error } = await sb()
    .from('impresoras')
    .update(update)
    .eq('id', id)
    .eq('restaurante_id', rid)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ impresora: data })
}

export async function DELETE(req: NextRequest) {
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  // Verificar que la impresora pertenece a este restaurante antes de borrar
  const { error } = await sb().from('impresoras').delete().eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
