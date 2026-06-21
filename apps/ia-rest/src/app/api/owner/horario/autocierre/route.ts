export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * POST /api/owner/horario/autocierre
 * Cierra los turnos de fichaje "colgados" (estado 'activo', con camarero, que llevan
 * abiertos más de `config_horario.autocierre_horas`). Evita horas_totales infladas por
 * olvidos de fichar salida. La salida se fija a entrada + límite (no a "ahora") y se marca
 * en notas para que el owner lo revise. Disparable a mano desde la UI o por cron.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: cfg } = await supabase
    .from('config_horario').select('autocierre_horas').eq('local_id', rid).maybeSingle()
  const horas = Number(cfg?.autocierre_horas ?? 14)
  const limiteMs = horas * 3_600_000
  const corte = new Date(Date.now() - limiteMs).toISOString()

  // Turnos de fichaje (camarero asignado) activos y antiguos.
  const { data: colgados, error } = await supabase
    .from('turnos')
    .select('id, entrada_at, notas')
    .eq('local_id', rid).eq('estado', 'activo')
    .not('camarero_id', 'is', null)
    .lt('entrada_at', corte)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let cerrados = 0
  for (const t of colgados ?? []) {
    const salida = new Date(new Date(t.entrada_at).getTime() + limiteMs).toISOString()
    const nota = `${t.notas ? t.notas + ' · ' : ''}autocierre (${horas}h sin salida)`
    const { error: upErr } = await supabase
      .from('turnos')
      .update({ salida_at: salida, horas_totales: horas, estado: 'cerrado', notas: nota })
      .eq('id', t.id)
    if (!upErr) cerrados++
  }

  return NextResponse.json({ ok: true, cerrados, limite_horas: horas })
}
