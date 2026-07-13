import { BUCKET_DOCS } from '@/lib/carpetas'

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

/** URL firmada de descarga (1 h) para un objeto del bucket privado.
 *  Firma con service_role (no anon): así la policy de lectura del bucket
 *  rrhh-documentos puede cerrarse a service_role sin romper las descargas
 *  (hallazgo M17 · migración 02-rrhh-documentos-bucket.sql). */
export async function urlFirmada(path: string): Promise<string | null> {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/${BUCKET_DOCS}/${path}`
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    if (!r.ok) {
      console.error('[storage] urlFirmada', r.status, await r.text())
      return null
    }
    const d = await r.json()
    const s: string | undefined = d.signedURL || d.signedUrl
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    return s ? `${base}/storage/v1${s.startsWith('/') ? '' : '/'}${s}` : null
  } catch (e: any) {
    console.error('[storage] urlFirmada', e?.message)
    return null
  }
}

/** Descarga los bytes de un objeto del bucket privado (service_role). Para hashear al firmar. */
export async function descargarObjeto(path: string): Promise<ArrayBuffer> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${path}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${serviceKey()}` } })
  if (!r.ok) throw new Error(`Storage download ${r.status}`)
  return r.arrayBuffer()
}
