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
      // 🚨 `apikey` NO es opcional (medido 11/09/2026, ver docs/ROTACION-SERVICE-ROLE.md): con las
      // claves nuevas de Supabase (`sb_publishable_…`/`sb_secret_…`, que no son JWT) Storage
      // responde 403 `Invalid Compact JWS` si la clave va SOLO en `Authorization`. Con la `anon`
      // legacy —que sí es un JWT— el Bearer a secas funcionaba, así que esto se veía sano hasta el
      // día de la rotación. Mandando las dos cabeceras funciona con las viejas y con las nuevas.
      headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' },
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
