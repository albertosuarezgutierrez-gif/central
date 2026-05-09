import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data: activo } = await supabase.from('turnos')
    .select('*').eq('estado', 'activo').eq('restaurante_id', rid)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const { data: ultimo } = await supabase.from('turnos')
    .select('*').eq('estado', 'cerrado').eq('restaurante_id', rid)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  // Impacto del turno activo (para mostrar en confirm de cierre)
  let impacto_activo: { comandas_en_cocina: number; mesas: string[] } | null = null
  if (activo) {
    const { data: cActivas } = await supabase.from('comandas')
      .select('mesa:mesas(codigo)')
      .eq('turno_id', activo.id)
      .eq('restaurante_id', rid)
      .in('estado', ['nueva', 'en_cocina'])
    if (cActivas && cActivas.length > 0) {
      const mesas = [...new Set(cActivas.map((c) => {
        const m = (Array.isArray(c.mesa) ? c.mesa[0] : c.mesa) as { codigo: string } | null
        return m?.codigo ?? null
      }).filter(Boolean))] as string[]
      impacto_activo = { comandas_en_cocina: cActivas.length, mesas }
    }
  }

  let stats: { total_comandas: number; avg_latencia_ms: number | null; mesas_activas: { codigo: string; count: number }[] } | null = null
  if (ultimo) {
    const { data: comandas } = await supabase.from('comandas')
      .select('id, mesa_id, created_at, updated_at, tipo, mesas(codigo)')
      .eq('turno_id', ultimo.id).eq('restaurante_id', rid)
    if (comandas && comandas.length > 0) {
      const { data: txs } = await supabase.from('transcripciones')
        .select('latencia_ms').eq('turno_id', ultimo.id).not('latencia_ms', 'is', null)
      const avgLatencia = txs?.length
        ? Math.round(txs.reduce((s, t) => s + (t.latencia_ms || 0), 0) / txs.length) : null
      const mesaCounts: Record<string, { codigo: string; count: number }> = {}
      comandas.forEach((c) => {
        const m = (Array.isArray(c.mesas) ? c.mesas[0] : c.mesas) as { codigo: string } | null
        if (m?.codigo) { if (!mesaCounts[m.codigo]) mesaCounts[m.codigo] = { codigo: m.codigo, count: 0 }; mesaCounts[m.codigo].count++ }
      })
      stats = { total_comandas: comandas.length, avg_latencia_ms: avgLatencia,
        mesas_activas: Object.values(mesaCounts).sort((a,b) => b.count - a.count).slice(0,5) }
    }
  }
  return NextResponse.json({ activo, ultimo, stats, impacto_activo })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { nombre } = await req.json()
  await supabase.from('turnos').update({ estado: 'cerrado' }).eq('estado', 'activo').eq('restaurante_id', rid)
  const { data, error } = await supabase.from('turnos')
    .insert({ nombre: nombre || `Turno ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`, restaurante_id: rid })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ turno: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase.from('turnos')
    .update({ estado: 'cerrado' }).eq('estado', 'activo').eq('restaurante_id', rid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ turno: data })
}
