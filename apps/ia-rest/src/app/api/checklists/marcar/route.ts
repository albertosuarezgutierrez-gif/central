export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST — marca una tarea como hecha. Si viene foto_base64 la sube a Storage.
// body { plantilla_id, seccion, tarea_idx, tarea_texto, foto_base64? }
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { plantilla_id, seccion, tarea_idx, tarea_texto, foto_base64 } = body as {
    plantilla_id?: string
    seccion?: string
    tarea_idx?: number
    tarea_texto?: string
    foto_base64?: string
  }

  if (!plantilla_id || typeof tarea_idx !== 'number') {
    return NextResponse.json({ error: 'plantilla_id y tarea_idx requeridos' }, { status: 400 })
  }

  let foto_url: string | null = null

  if (foto_base64) {
    // foto_base64 puede venir como data-url (data:image/jpeg;base64,XXXX) o base64 puro
    try {
      const match = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/.exec(foto_base64)
      const mediaType = match ? match[1] : 'image/jpeg'
      const rawB64 = match ? match[2] : foto_base64
      const ext = mediaType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const buffer = Buffer.from(rawB64, 'base64')
      const path = `checklists/${rid}/${plantilla_id}_${tarea_idx}_${Date.now()}.${ext}`

      // Bucket 'checklists' (créalo en Supabase si no existe). Si la subida falla
      // (p.ej. bucket inexistente) caemos a guardar el data-url directamente.
      const { error: upErr } = await supabase.storage
        .from('checklists')
        .upload(path, buffer, { contentType: mediaType, upsert: true })

      if (upErr) {
        // TODO: crear bucket 'checklists' en Storage; mientras tanto fallback al data-url.
        console.warn('[checklists/marcar] upload falló, fallback data-url:', upErr.message)
        foto_url = foto_base64
      } else {
        const { data: { publicUrl } } = supabase.storage.from('checklists').getPublicUrl(path)
        foto_url = publicUrl
      }
    } catch (e) {
      console.warn('[checklists/marcar] procesando foto falló:', (e as Error).message)
      foto_url = foto_base64
    }
  }

  const { data, error } = await supabase
    .from('checklist_ejecuciones')
    .insert({
      restaurante_id: rid,
      plantilla_id,
      personal_id: session.camarero_id ?? null,
      seccion: seccion ?? null,
      tarea_idx,
      tarea_texto: tarea_texto ?? null,
      estado: 'hecha',
      foto_url,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ejecucion: data })
}
