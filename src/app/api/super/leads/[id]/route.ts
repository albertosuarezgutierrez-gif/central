import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

const ESTADOS = ['nuevo', 'contactado', 'demo', 'cliente', 'descartado']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const { id } = await params
  const { estado, notas } = await req.json()
  if (estado && !ESTADOS.includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }
  const supabase = createServerClient()
  const patch: Record<string, string> = {}
  if (estado) patch.estado = estado
  if (notas !== undefined) patch.notas = notas
  const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}
