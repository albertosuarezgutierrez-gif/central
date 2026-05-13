// ============================================================
// POST /api/owner/logo — sube logo del restaurante a Supabase Storage
// DELETE /api/owner/logo — elimina el logo actual
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'

const adminClient = () => createServerClient()

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  if (!rid) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  // Validación
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Formato no soportado. Usa PNG, JPG, WebP o SVG.' }, { status: 400 })
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'El archivo supera los 2 MB.' }, { status: 400 })
  }

  const ext = file.type === 'image/svg+xml' ? 'svg'
    : file.type === 'image/webp' ? 'webp'
    : file.type === 'image/png' ? 'png'
    : 'jpg'

  // Nombre de archivo determinista por restaurante (sobreescribe versión anterior)
  const path = `${rid}/logo.${ext}`

  const admin = adminClient()

  // Eliminar versiones anteriores de otras extensiones
  const otherExts = ['png', 'jpg', 'webp', 'svg', 'gif'].filter(e => e !== ext)
  await Promise.all(otherExts.map(e =>
    admin.storage.from('logos').remove([`${rid}/logo.${e}`]).catch(() => {})
  ))

  // Subir
  const bytes = await file.arrayBuffer()
  const { error: uploadErr } = await admin.storage
    .from('logos')
    .upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  // URL pública
  const { data: urlData } = admin.storage.from('logos').getPublicUrl(path)
  // Añadir cache-buster para forzar refresco en el navegador
  const logo_url = `${urlData.publicUrl}?v=${Date.now()}`

  // Guardar en restaurantes
  const { error: dbErr } = await supabase
    .from('restaurantes')
    .update({ logo_url, updated_at: new Date().toISOString() })
    .eq('id', rid)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ logo_url })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  if (!rid) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const admin = adminClient()

  // Borrar cualquier logo existente
  const exts = ['png', 'jpg', 'webp', 'svg', 'gif']
  await Promise.all(exts.map(e =>
    admin.storage.from('logos').remove([`${rid}/logo.${e}`]).catch(() => {})
  ))

  await supabase
    .from('restaurantes')
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq('id', rid)

  return NextResponse.json({ ok: true })
}
