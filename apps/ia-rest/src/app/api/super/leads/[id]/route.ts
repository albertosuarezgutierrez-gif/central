export const dynamic = 'force-dynamic'

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
  const { estado, notas, evento } = await req.json()

  if (estado && !ESTADOS.includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const patch: Record<string, unknown> = {}
  if (estado) patch.estado = estado
  if (notas !== undefined) patch.notas = notas

  // Si hay evento nuevo, hacer append al array JSONB
  if (evento) {
    const { data: current } = await supabase.from('leads').select('eventos').eq('id', id).single()
    const eventos = Array.isArray(current?.eventos) ? current.eventos : []
    patch.eventos = [...eventos, { ...evento, fecha: new Date().toISOString().split('T')[0] }]
    // Si hay cambio de estado, añadir también evento de estado
    if (estado) {
      patch.eventos = [...(patch.eventos as unknown[]), {
        tipo: '✅',
        texto: `Estado actualizado a: ${estado}`,
        fecha: new Date().toISOString().split('T')[0]
      }]
    }
  } else if (estado) {
    // Cambio de estado sin evento explícito: añadir evento automático
    const { data: current } = await supabase.from('leads').select('eventos').eq('id', id).single()
    const eventos = Array.isArray(current?.eventos) ? current.eventos : []
    patch.eventos = [...eventos, {
      tipo: '✅',
      texto: `Estado actualizado a: ${estado}`,
      fecha: new Date().toISOString().split('T')[0]
    }]
  }

  const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServerClient()
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
