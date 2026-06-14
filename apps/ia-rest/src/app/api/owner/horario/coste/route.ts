export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * POST /api/owner/horario/coste  { camarero_id, coste_hora }
 * Fija (o borra, si coste_hora null/'') el coste/hora de un empleado en
 * config_horario.costes_empleado (merge). camareros es una vista, por eso vive aquí.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json().catch(() => ({}))
  const camareroId: string | null = body.camarero_id ?? null
  if (!camareroId) return NextResponse.json({ error: 'camarero_id requerido' }, { status: 400 })
  const coste = body.coste_hora === '' || body.coste_hora == null ? null : Number(body.coste_hora)
  if (coste != null && !Number.isFinite(coste)) return NextResponse.json({ error: 'coste_hora inválido' }, { status: 400 })

  const { data: cfg } = await supabase
    .from('config_horario').select('local_id, costes_empleado').eq('local_id', rid).maybeSingle()
  const mapa: Record<string, number> = (cfg?.costes_empleado as Record<string, number> | null) ?? {}
  if (coste == null) delete mapa[camareroId]
  else mapa[camareroId] = coste

  const { error } = cfg?.local_id
    ? await supabase.from('config_horario').update({ costes_empleado: mapa, updated_at: new Date().toISOString() }).eq('local_id', rid)
    : await supabase.from('config_horario').insert({ local_id: rid, costes_empleado: mapa })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, costes_empleado: mapa })
}
