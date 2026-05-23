import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  // Validar tipo y tamaño (máx 2MB)
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Formato no válido. Usa PNG, JPG, WebP o SVG' }, { status: 400 })
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'El logo no puede superar 2MB' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `web/${restauranteId}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  // Upsert en bucket logos (público)
  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)

  // Añadir cache-buster para que se refresque en la web
  const url = `${publicUrl}?v=${Date.now()}`

  // Guardar en web_restaurante
  await supabase
    .from('web_restaurante')
    .update({ logo_url: url })
    .eq('restaurante_id', restauranteId)

  return NextResponse.json({ ok: true, logo_url: url })
}
