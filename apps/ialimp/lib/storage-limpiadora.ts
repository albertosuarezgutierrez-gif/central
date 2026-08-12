// Acceso al bucket PRIVADO `documentos-limpiadora` (RR.HH. de la limpiadora).
// Espejo de apps/rrhh/lib/storage.ts: subir/borrar con service_role, URL firmada con
// anon key (core-storage), descargar para hashear al firmar. NO es el bucket público de fotos.
import { signStorageObject, type SupabaseStorageConfig } from '@central/core-storage'
import { requireSecret } from '@central/core-identity'
import { BUCKET_DOCS_LIMP } from '@/lib/carpetas-limpiadora'

function cfg(): SupabaseStorageConfig {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  }
}

// 🚨 `requireSecret` y no `process.env.X!` (12/08/2026). El proyecto Vercel `ialimp` NO
// tiene `SUPABASE_SERVICE_ROLE_KEY` — comprobado en las variables propias del proyecto, en
// las compartidas enlazadas y en las del equipo: no está por ninguna vía. Con el `!`, la
// cabecera salía como `Bearer undefined` y Storage devolvía un `401` opaco: subir un
// documento al expediente o generar la nómina en PDF fallaba con «Storage upload 401», que
// no menciona la variable y manda a quien lo investigue a buscar un problema de permisos
// que no existe. Nadie lo vio porque el módulo lleva semanas sin usarse, no porque funcione.
//
// Ahora el error dice el nombre de la variable que falta. Esto NO arregla la ausencia —
// eso es añadirla al proyecto Vercel—, solo hace que se diagnostique de un vistazo.
//
// Ojo al añadirla: `app/api/admin/ia/agente-cotizador/route.ts` hace
// `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`, así que hoy corre con la
// clave pública y sujeto a RLS. El día que exista la variable, ese endpoint pasa a saltarse
// RLS sin que nadie lo toque: conviene revisar qué devuelve antes y después.
const serviceKey = () => requireSecret('SUPABASE_SERVICE_ROLE_KEY')
const baseUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_DOCS_LIMP}/${path}`

/** Sube bytes al bucket privado con service_role. Devuelve el path o lanza. */
export async function subirObjeto(path: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const r = await fetch(baseUrl(path), {
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
  await fetch(baseUrl(path), { method: 'DELETE', headers: { Authorization: `Bearer ${serviceKey()}` } }).catch(() => {})
}

/** URL firmada de descarga (1 h) para un objeto del bucket privado. */
export async function urlFirmada(path: string): Promise<string | null> {
  return signStorageObject(cfg(), BUCKET_DOCS_LIMP, path, 3600)
}

/** Descarga los bytes de un objeto del bucket privado (service_role). Para hashear al firmar. */
export async function descargarObjeto(path: string): Promise<ArrayBuffer> {
  const r = await fetch(baseUrl(path), { headers: { Authorization: `Bearer ${serviceKey()}` } })
  if (!r.ok) throw new Error(`Storage download ${r.status}`)
  return r.arrayBuffer()
}
