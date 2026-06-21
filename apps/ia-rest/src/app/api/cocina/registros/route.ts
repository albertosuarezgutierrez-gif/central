export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

function hoy(): string { return new Date().toISOString().slice(0, 10) }

/** GET /api/cocina/registros?fecha=YYYY-MM-DD — estado del día por elaboración */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const fecha = req.nextUrl.searchParams.get('fecha') || hoy()

  const { data, error } = await supabase
    .from('cocina_registros').select('*').eq('local_id', rid).eq('fecha', fecha)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fecha, registros: data ?? [] })
}

type Control = { tipo: string; valor: number | null; hora: string; por?: string }

/**
 * POST /api/cocina/registros — registra una acción del día (upsert por receta+fecha).
 * body: { receta_id, fecha?, action: 'hecho'|'control'|'muestra'|'firma', ... }
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const body = await req.json()
  const receta_id = String(body.receta_id ?? '')
  if (!receta_id) return NextResponse.json({ error: 'receta_id requerido' }, { status: 400 })
  const fecha = body.fecha || hoy()
  const ahora = new Date().toISOString()

  // Estado actual (si existe)
  const { data: actual } = await supabase
    .from('cocina_registros').select('*')
    .eq('local_id', rid).eq('fecha', fecha).eq('receta_id', receta_id).maybeSingle()

  const quien = session.nombre ?? ''
  const row: Record<string, unknown> = {
    local_id: rid, fecha, receta_id,
    hecho: actual?.hecho ?? false,
    controles: actual?.controles ?? [],
    muestra_testigo_at: actual?.muestra_testigo_at ?? null,
    firma: actual?.firma ?? null,
    firmado_at: actual?.firmado_at ?? null,
    hecho_por: actual?.hecho_por ?? null,
    hecho_por_id: actual?.hecho_por_id ?? null,
    hecho_at: actual?.hecho_at ?? null,
    firma_por_id: actual?.firma_por_id ?? null,
    updated_at: ahora,
  }

  switch (body.action) {
    case 'hecho': {
      const nuevo = body.valor ?? !actual?.hecho
      row.hecho = nuevo
      // atribución: quién y cuándo marcó hecho (tiempo real)
      row.hecho_por = nuevo ? quien : null
      row.hecho_por_id = nuevo ? session.id : null
      row.hecho_at = nuevo ? ahora : null
      break
    }
    case 'control': {
      const ctrl: Control = { tipo: String(body.tipo), valor: body.valor != null && body.valor !== '' ? Number(body.valor) : null, hora: ahora, por: quien }
      const lista = (Array.isArray(row.controles) ? row.controles : []) as Control[]
      // sustituye el control del mismo tipo si ya existía
      row.controles = [...lista.filter(c => c.tipo !== ctrl.tipo), ctrl]
      break
    }
    case 'muestra':
      row.muestra_testigo_at = actual?.muestra_testigo_at ? null : ahora
      break
    case 'firma':
      row.firma = String(body.firma ?? quien).trim() || null
      row.firmado_at = row.firma ? ahora : null
      row.firma_por_id = row.firma ? session.id : null
      break
    default:
      return NextResponse.json({ error: 'acción no válida' }, { status: 400 })
  }

  const { error } = await supabase
    .from('cocina_registros')
    .upsert(row, { onConflict: 'local_id,fecha,receta_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
