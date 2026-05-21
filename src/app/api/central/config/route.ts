import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const cuentaId = session.cuenta_id
  if (!cuentaId) return NextResponse.json({ configuracion: {} })
  const { data } = await supabase.from('cuentas').select('configuracion').eq('id', cuentaId).single()
  return NextResponse.json({ configuracion: data?.configuracion ?? {} })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const cuentaId = session.cuenta_id
  if (!cuentaId) return NextResponse.json({ error: 'Sin cuenta' }, { status: 400 })
  const { configuracion } = await req.json()
  const { error } = await supabase.from('cuentas').update({ configuracion }).eq('id', cuentaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
