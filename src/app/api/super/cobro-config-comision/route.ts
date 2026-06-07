export const dynamic = 'force-dynamic'

// GET/POST /api/super/cobro-config-comision
// Configuración de la comisión de cobros de grupo POR RESTAURANTE (super admin).
// Valores NULL → el checkout usa los defaults de plataforma (lib/cobros-comision.ts).
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { PLATAFORMA_DEFAULT } from '@/lib/cobros-comision'

export const runtime = 'nodejs'

function autorizado(req: NextRequest) {
  const session = getSession(req)
  return session && session.rol === 'super_admin'
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()

  const { data: rests } = await supabase
    .from('restaurantes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  const { data: cfgs } = await supabase
    .from('cobro_config')
    .select('local_id, comision_pct, comision_fija_eur, minimo_producto_eur')

  const byId = new Map((cfgs ?? []).map((c: Record<string, unknown>) => [c.local_id as string, c]))
  const restaurantes = (rests ?? []).map((r: { id: string; nombre: string }) => {
    const c = (byId.get(r.id) ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      nombre: r.nombre,
      comision_pct: c.comision_pct ?? null,
      comision_fija_eur: c.comision_fija_eur ?? null,
      minimo_producto_eur: c.minimo_producto_eur ?? null,
    }
  })

  return NextResponse.json({ restaurantes, defaults: PLATAFORMA_DEFAULT })
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()

  const body = await req.json()
  const restaurante_id = body.restaurante_id as string | undefined
  if (!restaurante_id) return NextResponse.json({ error: 'restaurante_id requerido' }, { status: 400 })

  // '' o null → NULL (usa default de plataforma). Negativos no permitidos.
  const num = (v: unknown): number | null => {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const { error } = await supabase
    .from('cobro_config')
    .upsert(
      {
        restaurante_id,
        comision_pct: num(body.comision_pct),
        comision_fija_eur: num(body.comision_fija_eur),
        minimo_producto_eur: num(body.minimo_producto_eur),
      },
      { onConflict: 'restaurante_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
