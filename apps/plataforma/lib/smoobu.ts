import { prisma } from '@/lib/db'

// Fuente ÚNICA de credenciales de Smoobu para plataforma.
//
// La key vive en la BD compartida, en `pms_connections` (tabla propiedad de ialimp): la MISMA
// conexión que usan las limpiezas (ialimp/Si que Brilla) y sivra. Se rota en un solo sitio (la UI
// de ialimp) y todos los proyectos la recogen sin tocar envs ni redeploys.
//
// 🔑 AUTENTICACIÓN: header `Api-Key` (esquema legacy de Smoobu, VIGENTE para esta cuenta).
// El 23-jun-2026 se descartó empíricamente la migración HMAC: el header `Api-Key` con la key
// correcta devuelve 200 (probado contra /api/threads). Lo que rompía era una key INVÁLIDA en la
// BD; en cuanto se puso la buena, todo volvió. Usa SIEMPRE `smoobuFetch`, no `fetch` directo, para
// que la key salga de la fuente única.
const CONNECTION_ID =
  process.env.SMOOBU_PMS_CONNECTION_ID ?? 'c8c1fb07-8538-4656-8e09-9546e9014a25'
const BASE = 'https://login.smoobu.com'

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

// fetch a Smoobu con el header `Api-Key`. `pathOrUrl` puede ser ruta ('/api/...') o URL completa.
export async function smoobuFetch(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const key = await getSmoobuKey()
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    'Api-Key': key,
    'Cache-Control': 'no-cache',
  }
  const body = typeof init.body === 'string' ? init.body : undefined
  if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return fetch(url, { ...init, headers })
}
