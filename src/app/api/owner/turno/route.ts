import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// GET: active turno + last closed turno summary
export async function GET() {
  const supabase = createServerClient()

  // Active turno
  const { data: activo } = await supabase
    .from('turnos')
    .select('*')
    .eq('estado', 'activo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Last closed turno with stats
  const { data: ultimo } = await supabase
    .from('turnos')
    .select('*')
    .eq('estado', 'cerrado')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let stats = null
  if (ultimo) {
    const { data: comandas } = await supabase
      .from('comandas')
      .select('id, mesa_id, created_at, updated_at, tipo, mesas(codigo)')
      .eq('turno_id', ultimo.id)

    if (comandas && comandas.length > 0) {
      // Avg latency from transcripciones
      const { data: txs } = await supabase
        .from('transcripciones')
        .select('latencia_ms')
        .eq('turno_id', ultimo.id)
        .not('latencia_ms', 'is', null)

      const avgLatencia = txs && txs.length > 0
        ? Math.round(txs.reduce((s, t) => s + (t.latencia_ms || 0), 0) / txs.length)
        : null

      // Mesas más activas
      const mesaCounts: Record<string, { codigo: string; count: number }> = {}
      comandas.forEach((c) => {
        const m = (Array.isArray(c.mesas) ? c.mesas[0] : c.mesas) as { codigo: string } | null
        if (m?.codigo) {
          if (!mesaCounts[m.codigo]) mesaCounts[m.codigo] = { codigo: m.codigo, count: 0 }
          mesaCounts[m.codigo].count++
        }
      })
      const mesasActivas = Object.values(mesaCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      stats = {
        total_comandas: comandas.length,
        avg_latencia_ms: avgLatencia,
        mesas_activas: mesasActivas,
      }
    }
  }

  return NextResponse.json({ activo, ultimo, stats })
}

// POST: open new turno
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { nombre } = await req.json()

  await supabase.from('turnos').update({ estado: 'cerrado' }).eq('estado', 'activo')

  const { data, error } = await supabase
    .from('turnos')
    .insert({ nombre: nombre || `Turno ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ turno: data })
}

// DELETE: close active turno
export async function DELETE() {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('turnos')
    .update({ estado: 'cerrado' })
    .eq('estado', 'activo')
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ turno: data })
}
