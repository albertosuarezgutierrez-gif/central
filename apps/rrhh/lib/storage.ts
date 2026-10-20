import { signStorageObject, type SupabaseStorageConfig } from '@central/core-storage'
import { BUCKET_DOCS } from '@/lib/carpetas'
import { cabecerasClave, clavePublicable } from './claves-supabase'

function cfg(): SupabaseStorageConfig {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: clavePublicable(),
  }
}

const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Sube bytes al bucket privado con service_role. Devuelve el path o lanza. */
export async function subirObjeto(path: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${path}`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      ...cabecerasClave(serviceKey()),
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
  await fetch(url, { method: 'DELETE', headers: cabecerasClave(serviceKey()) }).catch(() => {})
}

/** URL firmada de descarga (1 h) para un objeto del bucket privado. */
export async function urlFirmada(path: string): Promise<string | null> {
  return signStorageObject(cfg(), BUCKET_DOCS, path, 3600)
}

/**
 * Crea una URL firmada para que el cliente suba DIRECTAMENTE a Supabase Storage
 * sin pasar por la función serverless (elimina el doble salto de red).
 * El token caduca en 60 s — suficiente para iniciar la subida.
 */
export async function presignSubida(path: string): Promise<string> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET_DOCS}/${path}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...cabecerasClave(serviceKey()), 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!r.ok) throw new Error(`Storage presign ${r.status}: ${await r.text()}`)
  const { signedURL } = await r.json()
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}${signedURL}`
}

/** Descarga los bytes de un objeto del bucket privado (service_role). Para hashear al firmar. */
export async function descargarObjeto(path: string): Promise<ArrayBuffer> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${path}`
  const r = await fetch(url, { headers: cabecerasClave(serviceKey()) })
  if (!r.ok) throw new Error(`Storage download ${r.status}`)
  return r.arrayBuffer()
}

/** Copia un objeto dentro del bucket privado (service_role), sin bajarlo ni subirlo de nuevo. */
export async function copiarObjeto(origen: string, destino: string): Promise<void> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/copy`, {
    method: 'POST',
    headers: { ...cabecerasClave(serviceKey()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: BUCKET_DOCS, sourceKey: origen, destinationKey: destino }),
  })
  if (!r.ok) throw new Error(`Storage copy ${r.status}: ${await r.text()}`)
}

/**
 * Tamaño y tipo REALES de un objeto (HEAD, service_role). null si no existe o no se pudo leer.
 * `tamano`/`tipo` null = no lo dice Storage (no se sabe), nunca 0.
 */
export async function infoObjeto(path: string): Promise<{ tamano: number | null; tipo: string | null } | null> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}/${path}`
  const r = await fetch(url, { method: 'HEAD', headers: cabecerasClave(serviceKey()) }).catch(() => null)
  if (!r || !r.ok) return null
  const len = Number.parseInt(r.headers.get('content-length') ?? '', 10)
  const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim() || null
  return { tamano: Number.isFinite(len) && len >= 0 ? len : null, tipo }
}

/** Lista los objetos (no carpetas) directamente bajo `prefijo/` (service_role). Lanza si Storage falla. */
export async function listarObjetos(prefijo: string, limit = 1000, offset = 0): Promise<{ path: string; creado_at: string | null }[]> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/list/${BUCKET_DOCS}`, {
    method: 'POST',
    headers: { ...cabecerasClave(serviceKey()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: prefijo, limit, offset, sortBy: { column: 'created_at', order: 'asc' } }),
  })
  if (!r.ok) throw new Error(`Storage list ${r.status}: ${await r.text()}`)
  const xs = (await r.json()) as { name: string; id: string | null; created_at?: string | null }[]
  const base = prefijo.replace(/\/+$/, '')
  return xs.filter(x => x.id).map(x => ({ path: `${base}/${x.name}`, creado_at: x.created_at ?? null }))
}

/** Borra varios objetos de una vez (service_role). Lanza si Storage falla. */
export async function borrarObjetos(paths: string[]): Promise<void> {
  if (!paths.length) return
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS}`, {
    method: 'DELETE',
    headers: { ...cabecerasClave(serviceKey()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  })
  if (!r.ok) throw new Error(`Storage delete ${r.status}: ${await r.text()}`)
}
