import { signStorageObject, type SupabaseStorageConfig } from '@central/core-storage'
import { BUCKET_DOCS } from '@/lib/carpetas'

function cfg(): SupabaseStorageConfig {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  }
}

const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Sube bytes al bucket privado con service_role. Devuelve el path o lanza. */
export async function subirObjeto(path: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${path}`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!r.ok) throw new Error(`Storage upload ${r.status}: ${await r.text()}`)
  return path
}

/** Borra un objeto del bucket privado (best-effort). */
export async function borrarObjeto(path: string): Promise<void> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${path}`
  await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${serviceKey()}` } }).catch(() => {})
}

/** URL firmada de descarga (1 h) para un objeto del bucket privado. */
export async function urlFirmada(path: string): Promise<string | null> {
  return signStorageObject(cfg(), BUCKET_DOCS, path, 3600)
}
