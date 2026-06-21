// POST /api/mensajes/audio — sube un blob de audio a Supabase Storage y devuelve URL pública
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const dynamic = 'force-dynamic'

const BUCKET = 'chat-audio'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const rid = getRestauranteId(req)

  const formData = await req.formData()
  const file = formData.get('audio') as File | null
  if (!file) return NextResponse.json({ error: 'audio requerido' }, { status: 400 })

  // Limitar tamaño: máx 5 MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Audio demasiado grande (máx 5 MB)' }, { status: 413 })
  }

  const supabase = createServerClient()

  // Crear bucket si no existe (idempotente)
  const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'],
  })
  // ignorar error si ya existe
  if (bucketErr && !bucketErr.message.includes('already exists')) {
    console.error('[audio upload] createBucket:', bucketErr.message)
  }

  const ext  = file.type.includes('ogg') ? 'ogg' : file.type.includes('mp4') ? 'mp4' : 'webm'
  const path = `${rid}/${Date.now()}_${session.id.slice(0, 8)}.${ext}`

  const arrayBuffer = await file.arrayBuffer()

  // Normalizar MIME type: Chrome envía 'audio/webm;codecs=opus' pero el bucket solo acepta el base type
  const baseMime = (file.type || 'audio/webm').split(';')[0].trim()

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: baseMime,
      upsert: false,
    })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({ url: urlData.publicUrl }, { status: 201 })
}
