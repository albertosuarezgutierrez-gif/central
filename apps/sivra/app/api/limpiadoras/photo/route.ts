import { NextRequest, NextResponse } from 'next/server'
import { storageObjectPath, signStorageObject, publicStorageUrl } from '@iarest/core-storage'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BUCKET = 'cleaning-photos'
const EXPIRES = 3600 // 1h

// Proxy de lectura para el bucket privado `cleaning-photos`.
// Recibe la URL/ruta guardada (?u=...), genera una signed URL fresca y redirige.
// Las <img> de la zona limpiadoras apuntan aquí en vez de a una URL pública.
// El firmado lo hace el núcleo compartido @iarest/core-storage.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return NextResponse.json({ error: 'Missing u' }, { status: 400 })

  // Acepta tanto la URL pública completa (.../object/public/cleaning-photos/<path>)
  // como una ruta suelta.
  const path = storageObjectPath(u, BUCKET)
  if (!path) return NextResponse.json({ error: 'Bad path' }, { status: 400 })

  const cfg = { url: SUPABASE_URL, anonKey: SUPABASE_ANON }

  // Red de seguridad: si el firmado falla por cualquier motivo, caemos a la URL
  // pública del objeto. Mientras el bucket siga público las imágenes nunca se
  // rompen; una vez privado, el firmado es el camino real.
  const publicUrl = publicStorageUrl(cfg, BUCKET, path)
  const fallback = () =>
    new NextResponse(null, { status: 307, headers: { Location: publicUrl, 'Cache-Control': 'private, max-age=60' } })

  const finalUrl = await signStorageObject(cfg, BUCKET, path, EXPIRES)
  if (!finalUrl) return fallback()

  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: finalUrl,
      // Cache algo menor que la expiración para que el cliente no use enlaces caducados.
      'Cache-Control': `private, max-age=${EXPIRES - 120}`,
    },
  })
}
