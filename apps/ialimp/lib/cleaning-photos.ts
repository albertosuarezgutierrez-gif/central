// Firmado de fotos del bucket cleaning-photos (privado) con la anon key.
// La anon key tiene policy SELECT sobre el bucket -> NO hace falta service_role.
// La primitiva de firmado vive en @central/core-storage; aquí queda fijo el bucket.
import { storageObjectPath, signStorageObject } from '@central/core-storage'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BUCKET = 'cleaning-photos'
const MARKER = `/${BUCKET}/`

// Extrae el path dentro del bucket a partir de una URL pública (o de un path suelto).
export function cleaningPhotoPath(u: string): string | null {
  return storageObjectPath(u, BUCKET)
}

// Devuelve una URL firmada absoluta dentro de cleaning-photos, o null si no aplica/falla.
// Solo firma URLs del bucket cleaning-photos (deja fuera data: y otros buckets).
export async function signCleaningPhoto(u: string, expiresIn = 3600): Promise<string | null> {
  if (!u || !u.includes(MARKER)) return null
  const path = cleaningPhotoPath(u)
  if (!path) return null
  return signStorageObject({ url: SUPABASE_URL, anonKey: SUPABASE_ANON }, BUCKET, path, expiresIn)
}
