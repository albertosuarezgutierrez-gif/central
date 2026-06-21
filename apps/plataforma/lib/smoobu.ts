import { prisma } from '@/lib/db'

// Fuente ÚNICA de la API key de Smoobu para plataforma.
//
// La key vive en la BD compartida, en `pms_connections` (tabla propiedad de ialimp):
// es la MISMA conexión que usan las limpiezas. Así se rota en un solo sitio (la UI de
// ialimp) y plataforma la recoge sin tocar variables de entorno ni redeploys.
//
// `pms_connections` es multi-tenant, así que seleccionamos la fila de Alberto por `id`
// (no "la primera activa"), para no coger la key de otro cliente cuando ialimp crezca.
const CONNECTION_ID =
  process.env.SMOOBU_PMS_CONNECTION_ID ?? 'c8c1fb07-8538-4656-8e09-9546e9014a25'

let cache: { key: string; at: number } | null = null
const TTL_MS = 5 * 60_000

export async function getSmoobuKey(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.key
  let key = ''
  try {
    const rows = await prisma.$queryRaw<{ smoobu_api_key: string | null }[]>`
      SELECT smoobu_api_key
      FROM pms_connections
      WHERE id = ${CONNECTION_ID}::uuid AND activa = true
      LIMIT 1
    `
    key = rows?.[0]?.smoobu_api_key?.trim() ?? ''
  } catch {
    // BD no disponible → respaldo al env
  }
  if (!key) key = process.env.SMOOBU_API_KEY ?? ''
  cache = { key, at: Date.now() }
  return key
}
