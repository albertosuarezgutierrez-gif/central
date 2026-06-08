export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('leads_comunicacion')
    .select('id, tipo_interaccion, canal, resumen_ia, texto_reunion, created_at, contacto:leads_contactos(nombre, cargo)')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comunicaciones: data })
}
