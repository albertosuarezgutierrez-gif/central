export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const body = await req.json()
  const { nombre, restaurante, telefono, email, locales, tpv, contacto, notas } = body
  if (!nombre || !restaurante) {
    return NextResponse.json({ error: 'nombre y restaurante son obligatorios' }, { status: 400 })
  }
  const supabase = createServerClient()
  const eventoInicial = {
    tipo: '📋',
    texto: 'Lead creado manualmente',
    fecha: new Date().toISOString().split('T')[0]
  }
  const { data, error } = await supabase
    .from('leads')
    .insert({
      nombre,
      restaurante,
      telefono: telefono || '',
      email: email || null,
      locales: locales || null,
      tpv: tpv || null,
      contacto: contacto || null,
      notas: notas || null,
      tipo: 'personal',
      estado: 'nuevo',
      eventos: [eventoInicial]
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}
