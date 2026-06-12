export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// Parte de rotura / falta de material (con foto opcional). Las piezas rotas no vuelven al stock:
// se da de baja la cantidad del total y se calcula el coste = cantidad × coste_reposicion.
// body { material_id, asignacion_id?, cantidad, motivo?, foto_base64? }
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  const cantidad = Number(body.cantidad) || 0
  if (!body.material_id || cantidad <= 0) {
    return NextResponse.json({ error: 'material_id y cantidad (>0) requeridos' }, { status: 400 })
  }

  const { data: mat } = await supabase
    .from('materiales')
    .select('cantidad_total, coste_reposicion')
    .eq('id', body.material_id).eq('restaurante_id', rid).single()
  if (!mat) return NextResponse.json({ error: 'Material no encontrado' }, { status: 404 })

  // Subir foto si viene (patrón checklists: bucket 'materiales', fallback a data-url)
  let foto_url: string | null = null
  if (body.foto_base64) {
    try {
      const match = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/.exec(body.foto_base64)
      const mediaType = match ? match[1] : 'image/jpeg'
      const rawB64 = match ? match[2] : body.foto_base64
      const ext = mediaType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const buffer = Buffer.from(rawB64, 'base64')
      const path = `materiales/${rid}/${body.material_id}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('materiales')
        .upload(path, buffer, { contentType: mediaType, upsert: true })
      if (upErr) {
        foto_url = body.foto_base64
      } else {
        const { data: { publicUrl } } = supabase.storage.from('materiales').getPublicUrl(path)
        foto_url = publicUrl
      }
    } catch {
      foto_url = body.foto_base64
    }
  }

  const coste = cantidad * (Number(mat.coste_reposicion) || 0)

  const { data, error } = await supabase
    .from('materiales_dano')
    .insert({
      restaurante_id: rid,
      material_id: body.material_id,
      asignacion_id: body.asignacion_id ?? null,
      cantidad,
      motivo: body.motivo ?? 'rotura',
      foto_url,
      coste,
      personal_id: session.camarero_id ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Baja del total (las piezas rotas no existen ya). El disponible ya estaba descontado
  // por la asignación, así que solo se reduce el total.
  await supabase
    .from('materiales')
    .update({ cantidad_total: Math.max(0, (mat.cantidad_total ?? 0) - cantidad), updated_at: new Date().toISOString() })
    .eq('id', body.material_id).eq('restaurante_id', rid)

  return NextResponse.json({ dano: data })
}

// GET — partes de rotura (informe del dueño). Filtro opcional ?asignacion_id=
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const asignacionId = new URL(req.url).searchParams.get('asignacion_id')

  let q = supabase
    .from('materiales_dano')
    .select('id, material_id, asignacion_id, cantidad, motivo, foto_url, coste, personal_id, created_at, material:materiales(nombre, categoria)')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
  if (asignacionId) q = q.eq('asignacion_id', asignacionId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ danos: data ?? [] })
}
