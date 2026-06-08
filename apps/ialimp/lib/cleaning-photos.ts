// Firmado de fotos del bucket cleaning-photos (privado) con la anon key.
// La anon key tiene policy SELECT sobre el bucket -> NO hace falta service_role.
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BUCKET = 'cleaning-photos'
const MARKER = `/${BUCKET}/`

// Extrae el path dentro del bucket a partir de una URL pública (o de un path suelto).
export function cleaningPhotoPath(u: string): string | null {
  const idx = u.indexOf(MARKER)
  let p = idx === -1 ? u : u.slice(idx + MARKER.length)
  p = p.split('?')[0].replace(/^\/+/, '')
  return p || null
}

// Devuelve una URL firmada absoluta dentro de cleaning-photos, o null si no aplica/falla.
// Solo firma URLs del bucket cleaning-photos (deja fuera data: y otros buckets).
export async function signCleaningPhoto(u: string, expiresIn = 3600): Promise<string | null> {
  if (!u || !u.includes(MARKER)) return null
  const path = cleaningPhotoPath(u)
  if (!path) return null
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    })
    if (!r.ok) { console.error('sign', r.status, await r.text()); return null }
    const d = await r.json(); const s = d.signedURL || d.signedUrl
    return s ? `${SUPABASE_URL}/storage/v1${s.startsWith('/') ? '' : '/'}${s}` : null
  } catch (e: any) { console.error('signCleaningPhoto', e?.message); return null }
}
