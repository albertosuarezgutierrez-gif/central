/** Acceso al Storage de Supabase para firmar objetos de un bucket privado.
 *  `anonKey` basta si la anon key tiene policy SELECT sobre el bucket (no hace
 *  falta service_role). */
export interface SupabaseStorageConfig {
  url: string
  anonKey: string
}

/**
 * Extrae el path de un objeto dentro de `bucket` a partir de una URL pública
 * (`.../<bucket>/<path>`) o de una ruta suelta. Devuelve null si queda vacío.
 */
export function storageObjectPath(u: string, bucket: string): string | null {
  const marker = `/${bucket}/`
  const idx = u.indexOf(marker)
  let p = idx === -1 ? u : u.slice(idx + marker.length)
  p = p.split('?')[0].replace(/^\/+/, '')
  return p || null
}

/** URL pública (sin firmar) de un objeto del bucket. */
export function publicStorageUrl(config: SupabaseStorageConfig, bucket: string, path: string): string {
  return `${config.url}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Firma un objeto del Storage de Supabase vía REST (sin `@supabase/supabase-js`).
 * Devuelve una URL absoluta firmada o `null` si falla. No lanza: el firmado es
 * best-effort y cada vertical decide su fallback (p.ej. la URL pública).
 */
export async function signStorageObject(
  config: SupabaseStorageConfig,
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  try {
    const r = await fetch(`${config.url}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    })
    if (!r.ok) {
      console.error('signStorageObject', r.status, await r.text())
      return null
    }
    const d = await r.json()
    const s: string | undefined = d.signedURL || d.signedUrl
    return s ? `${config.url}/storage/v1${s.startsWith('/') ? '' : '/'}${s}` : null
  } catch (e: any) {
    console.error('signStorageObject', e?.message)
    return null
  }
}
