import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BUCKET = 'cleaning-photos'
const EXPIRES = 3600 // 1h

// Proxy de lectura para el bucket privado `cleaning-photos`.
// Recibe la URL/ruta guardada (?u=...), genera una signed URL fresca y redirige.
// Las <img> de la zona limpiadoras apuntan aquí en vez de a una URL pública.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return NextResponse.json({ error: 'Missing u' }, { status: 400 })

  // Extrae la ruta del objeto dentro del bucket. Acepta tanto la URL pública
  // completa (.../object/public/cleaning-photos/<path>) como una ruta suelta.
  const marker = `/${BUCKET}/`
  const idx = u.indexOf(marker)
  let path = idx === -1 ? u : u.slice(idx + marker.length)
  path = path.split('?')[0].replace(/^\/+/, '')
  if (!path) return NextResponse.json({ error: 'Bad path' }, { status: 400 })

  // Red de seguridad: si el firmado falla por cualquier motivo, caemos a la URL
  // pública del objeto. Mientras el bucket siga público las imágenes nunca se
  // rompen; una vez privado, el firmado es el camino real.
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
  const fallback = () =>
    new NextResponse(null, { status: 307, headers: { Location: publicUrl, 'Cache-Control': 'private, max-age=60' } })

  try {
    const signResp = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: EXPIRES }),
    })
    if (!signResp.ok) {
      console.error('sign error:', signResp.status, await signResp.text())
      return fallback()
    }
    const data = await signResp.json()
    const signed: string | undefined = data.signedURL || data.signedUrl
    if (!signed) return fallback()

    const finalUrl = `${SUPABASE_URL}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: finalUrl,
        // Cache algo menor que la expiración para que el cliente no use enlaces caducados.
        'Cache-Control': `private, max-age=${EXPIRES - 120}`,
      },
    })
  } catch (e: any) {
    console.error('photo proxy error:', e.message)
    return fallback()
  }
}
