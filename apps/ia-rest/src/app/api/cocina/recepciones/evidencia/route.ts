export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const maxDuration = 60

function hoy(): string { return new Date().toISOString().slice(0, 10) }

/** POST /api/cocina/recepciones/evidencia — sube la foto ORIGINAL del albarán/etiqueta
 *  al bucket privado `recepciones` como prueba documental APPCC. Devuelve URL firmada larga. */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (file.size > 8_000_000) return NextResponse.json({ error: 'Archivo demasiado grande' }, { status: 400 })

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const rand = Math.random().toString(36).slice(2, 10)
  const path = `${rid}/${hoy()}/${rand}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const supabase = createServerClient()
  const { error } = await supabase.storage.from('recepciones').upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // URL firmada de larga duración (1 año) para conservar la prueba documental.
  const { data: signed } = await supabase.storage.from('recepciones').createSignedUrl(path, 60 * 60 * 24 * 365)
  return NextResponse.json({ ok: true, path, url: signed?.signedUrl ?? null })
}
