import { NextRequest, NextResponse } from 'next/server'
import { signCleaningPhoto, cleaningPhotoPath } from '@/lib/cleaning-photos'

// Proxy de fotos del bucket privado cleaning-photos.
// Firma SIEMPRE contra cleaning-photos (no puede escapar a otro bucket).
// El fallback() a la URL pública hace el despliegue seguro: mientras el bucket
// siga público, las imágenes nunca se rompen aunque el firmado fallara.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const BUCKET = 'cleaning-photos'
const EXPIRES = 3600

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return NextResponse.json({ error: 'Missing u' }, { status: 400 })

  const path = cleaningPhotoPath(u)
  if (!path) return NextResponse.json({ error: 'Bad path' }, { status: 400 })

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
  const signed = await signCleaningPhoto(u, EXPIRES)

  if (!signed) {
    return new NextResponse(null, {
      status: 307,
      headers: { Location: publicUrl, 'Cache-Control': 'private, max-age=60' },
    })
  }
  return new NextResponse(null, {
    status: 307,
    headers: { Location: signed, 'Cache-Control': `private, max-age=${EXPIRES - 120}` },
  })
}
