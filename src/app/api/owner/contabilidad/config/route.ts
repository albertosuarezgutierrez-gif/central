export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { PGC_DEFECTO } from '@/lib/contabilidad'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data } = await supabase
    .from('config_contabilidad')
    .select('*')
    .eq('local_id', rid)
    .maybeSingle()

  // Si no existe aún, devolver defaults
  if (!data) {
    return NextResponse.json({
      config: {
        regimen_fiscal: 'irpf_directa',
        iva_regimen: 'general',
        formato_exportacion: 'csv',
        ejercicio_actual: new Date().getFullYear(),
        ...Object.fromEntries(
          Object.entries(PGC_DEFECTO).map(([k, v]) => [`cuenta_${k}`, v])
        ),
      },
      nuevo: true,
    })
  }

  return NextResponse.json({ config: data })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()

  const { data, error } = await supabase
    .from('config_contabilidad')
    .upsert({ ...body, restaurante_id: rid, updated_at: new Date().toISOString() }, { onConflict: 'restaurante_id' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, config: data })
}
