export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * POST /api/owner/contabilidad/umbral-empleado  { camarero_id, umbral }
 * Fija (o borra, si umbral es null/'') el umbral de descuadre individual de un
 * empleado. Se guarda en config_contabilidad.umbrales_empleado (merge).
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json().catch(() => ({}))
  const camareroId: string | null = body.camarero_id ?? null
  if (!camareroId) return NextResponse.json({ error: 'camarero_id requerido' }, { status: 400 })
  const umbral = body.umbral === '' || body.umbral == null ? null : Number(body.umbral)
  if (umbral != null && !Number.isFinite(umbral)) return NextResponse.json({ error: 'umbral inválido' }, { status: 400 })

  const { data: cfg } = await supabase
    .from('config_contabilidad').select('id, umbrales_empleado').eq('local_id', rid).maybeSingle()
  const mapa: Record<string, number> = (cfg?.umbrales_empleado as Record<string, number> | null) ?? {}
  if (umbral == null) delete mapa[camareroId]
  else mapa[camareroId] = umbral

  const { error } = cfg?.id
    ? await supabase.from('config_contabilidad').update({ umbrales_empleado: mapa }).eq('local_id', rid)
    : await supabase.from('config_contabilidad').insert({ local_id: rid, umbrales_empleado: mapa })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, umbrales_empleado: mapa })
}
