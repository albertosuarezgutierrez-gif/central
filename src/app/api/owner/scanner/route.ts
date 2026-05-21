export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

// GET  /api/owner/scanner → historial de documentos escaneados
// PUT  /api/owner/scanner → archivar o descartar un documento
// POST /api/owner/scanner/permiso → toggle puede_escanear en camarero

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  if (!rid) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const url    = new URL(req.url)
  const limit  = Math.min(Number(url.searchParams.get('limit') ?? 50), 100)
  const tipo   = url.searchParams.get('tipo')   // filtrar por tipo
  const estado = url.searchParams.get('estado') // filtrar por estado

  let query = supabase
    .from('documentos_escaneados')
    .select('id, tipo, confianza, datos_extraidos, escaneado_por_nombre, escaneado_por_rol, archivado_en, estado, created_at, imagen_base64')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (tipo)   query = query.eq('tipo', tipo)
  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ documentos: data ?? [] })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  if (!rid) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id, estado, archivado_en } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (estado)      updates.estado      = estado
  if (archivado_en) {
    updates.archivado_en  = archivado_en
    updates.archivado_at  = new Date().toISOString()
    updates.estado        = 'archivado'
  }

  const { error } = await supabase
    .from('documentos_escaneados')
    .update(updates)
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
