// /api/super/cuentas — CRUD cuentas de cliente (multi-restaurante)
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

function isSuperAdmin(req: NextRequest) {
  const s = getSession(req)
  return s?.rol === 'super_admin'
}

export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const sb = createServerClient()
  const { data, error } = await sb
    .from('v_cuentas_con_restaurantes')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cuentas: data })
}

export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const sb = createServerClient()
  const { nombre, email, telefono, pin_cuenta, nif, razon_social, notas_super } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre obligatorio' }, { status: 400 })
  if (!pin_cuenta?.trim()) return NextResponse.json({ error: 'PIN obligatorio' }, { status: 400 })
  const { data, error } = await sb.from('cuentas').insert({
    nombre: nombre.trim(), email: email?.trim() || null,
    telefono: telefono?.trim() || null,
    pin_cuenta: pin_cuenta.trim(),
    nif: nif?.trim() || null,
    razon_social: razon_social?.trim() || null,
    notas_super: notas_super?.trim() || null,
    estado: 'activo',
  }).select('id,nombre').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cuenta: data })
}

export async function PUT(req: NextRequest) {
  if (!isSuperAdmin(req)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const sb = createServerClient()
  const { id, ...patch } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const { error } = await sb.from('cuentas')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!isSuperAdmin(req)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const sb = createServerClient()
  const { id } = await req.json()
  // Desasociar restaurantes antes de borrar
  await sb.from('restaurantes').update({ cuenta_id: null }).eq('cuenta_id', id)
  await sb.from('camareros').update({ cuenta_id: null }).eq('cuenta_id', id)
  const { error } = await sb.from('cuentas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
