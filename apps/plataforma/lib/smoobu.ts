import crypto from 'node:crypto'
import { prisma } from '@/lib/db'

// Fuente ÚNICA de credenciales de Smoobu para plataforma.
//
// La key+secret viven en la BD compartida, en `pms_connections` (tabla propiedad de ialimp):
// la MISMA conexión que usan las limpiezas. Se rotan en un solo sitio y todos los proyectos las
// recogen sin tocar envs ni redeploys.
//
// 🔐 Smoobu migró a autenticación HMAC (29-may-2026); el header legacy `Api-Key` se apaga el
// 25-sep-2026 y ya devuelve 401 en cuentas migradas. Cada petición debe firmarse: 4 cabeceras
// (X-API-Key, X-Timestamp, X-Nonce, X-Signature). Usa SIEMPRE `smoobuFetch`, no `fetch` directo.
const CONNECTION_ID =
  process.env.SMOOBU_PMS_CONNECTION_ID ?? 'c8c1fb07-8538-4656-8e09-9546e9014a25'
const BASE = 'https://login.smoobu.com'

type Creds = { key: string; secret: string }
let cache: { creds: Creds; at: number } | null = null
const TTL_MS = 5 * 60_000

export async function getSmoobuCreds(): Promise<Creds> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.creds
  let key = ''
  let secret = ''
  try {
    const rows = await prisma.$queryRaw<{ smoobu_api_key: string | null; smoobu_api_secret: string | null }[]>`
      SELECT smoobu_api_key, smoobu_api_secret
      FROM pms_connections
      WHERE id = ${CONNECTION_ID}::uuid AND activa = true
      LIMIT 1
    `
    key = rows?.[0]?.smoobu_api_key?.trim() ?? ''
    secret = rows?.[0]?.smoobu_api_secret?.trim() ?? ''
  } catch {
    // BD no disponible → respaldo al env
  }
  if (!key) key = process.env.SMOOBU_API_KEY ?? ''
  if (!secret) secret = process.env.SMOOBU_API_SECRET ?? ''
  const creds = { key, secret }
  cache = { creds, at: Date.now() }
  return creds
}

// Compatibilidad: algún código viejo aún pide solo la key.
export async function getSmoobuKey(): Promise<string> {
  return (await getSmoobuCreds()).key
}

// Construye la cadena canónica que Smoobu firma (orden y separadores EXACTOS):
//   MÉTODO \n RUTA \n QUERY(orden alfabético) \n TIMESTAMP \n NONCE \n SHA256_hex(body) \n API_KEY
export function canonicalString(
  method: string, path: string, query: string, timestamp: string, nonce: string, bodyHashHex: string, apiKey: string,
): string {
  return [method.toUpperCase(), path, query, timestamp, nonce, bodyHashHex, apiKey].join('\n')
}

// fetch a Smoobu con firma HMAC-SHA256. `pathOrUrl` puede ser ruta ('/api/...') o URL completa.
export async function smoobuFetch(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const { key, secret } = await getSmoobuCreds()
  const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl)
  // Query en orden alfabético (por par crudo), y lo mandamos también así en la petición.
  const pairs = url.search ? url.search.slice(1).split('&').filter(Boolean).sort() : []
  const query = pairs.join('&')
  url.search = query ? `?${query}` : ''

  const method = (init.method || 'GET').toUpperCase()
  const body = typeof init.body === 'string' ? init.body : ''
  const bodyHashHex = crypto.createHash('sha256').update(body, 'utf8').digest('hex')
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') // sin milisegundos
  const nonce = crypto.randomUUID()
  const canonical = canonicalString(method, url.pathname, query, timestamp, nonce, bodyHashHex, key)
  const signature = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('base64')

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    'X-API-Key': key,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': signature,
    'Cache-Control': 'no-cache',
  }
  if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  return fetch(url.toString(), { ...init, headers })
}
