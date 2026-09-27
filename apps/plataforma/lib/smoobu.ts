import { prisma } from '@/lib/db'
import { firmarPeticion } from '@/lib/smoobu-firma'
import { debeUsarPuenteLegacy } from '@/lib/smoobu-puente-legacy'

// Fuente ÚNICA de credenciales de Smoobu para plataforma.
//
// La key vive en la BD compartida, en `pms_connections` (tabla propiedad de ialimp): la MISMA
// conexión que usan las limpiezas (ialimp/Si que Brilla) y sivra. Se rota en un solo sitio (la UI
// de ialimp) y todos los proyectos la recogen sin tocar envs ni redeploys.
//
// 🔑 AUTENTICACIÓN: **HMAC-SHA256** (`X-API-Key` + `X-Timestamp` + `X-Nonce` + `X-Signature`).
// El esquema legacy (header `Api-Key` con la key plana) está deprecado y su sunset es el
// 25/09/2026, pero SIGUE FUNCIONANDO hasta esa fecha (verificado a mano 15/09/2026, ver el
// puente temporal más abajo — la nota anterior de este comentario, que decía «ya devuelve 401 en
// producción», estaba equivocada). El par key+secret vive en `pms_connections`
// (`smoobu_api_key` / `smoobu_api_secret`). La construcción del canonical y la firma están en el
// módulo PURO `lib/smoobu-firma.ts`, contrastado con el ejemplo oficial de Smoobu.
//
// Usa SIEMPRE `smoobuFetch`, no `fetch` directo: es el único sitio donde se firma.
const CONNECTION_ID =
  process.env.SMOOBU_PMS_CONNECTION_ID ?? 'c8c1fb07-8538-4656-8e09-9546e9014a25'
const BASE = 'https://login.smoobu.com'

type Credenciales = { key: string; secret: string }

let cache: { cred: Credenciales; at: number } | null = null
const TTL_MS = 5 * 60_000

export async function getSmoobuCredenciales(): Promise<Credenciales> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cred
  let key = ''
  let secret = ''
  try {
    const rows = await prisma.$queryRaw<
      { smoobu_api_key: string | null; smoobu_api_secret: string | null }[]
    >`
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
  const cred = { key, secret }
  cache = { cred, at: Date.now() }
  return cred
}

/**
 * Sigue exportada porque varias rutas la usan solo para comprobar «¿hay key configurada?»
 * antes de seguir. Para HABLAR con Smoobu, `smoobuFetch`.
 */
export async function getSmoobuKey(): Promise<string> {
  return (await getSmoobuCredenciales()).key
}

/**
 * fetch a Smoobu firmado con HMAC-SHA256. `pathOrUrl` puede ser ruta ('/api/...') o URL completa.
 * Se firma el METHOD, el PATH, la query ORDENADA, el sello de tiempo, un nonce único y el hash
 * del cuerpo — así que la URL y el cuerpo que se firman tienen que ser EXACTAMENTE los que se
 * envían (por eso el cuerpo se serializa una sola vez, aquí).
 */
export async function smoobuFetch(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const { key, secret } = await getSmoobuCredenciales()
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl
  const method = (init.method ?? 'GET').toUpperCase()
  const body = typeof init.body === 'string' ? init.body : undefined

  // 🌉 PUENTE TEMPORAL — GET /api/rates da 401 con HMAC (ticket Smoobu #1864141, sin resolver):
  // la firma es correcta y funciona en /reservations, pero /rates la rechaza con parámetros
  // array (apartments[]). Confirmado a mano el 15/09/2026: legacy 200, HMAC 401, mismo endpoint,
  // misma propiedad. El esquema legacy no firma con HMAC, así que es inmune a ese fallo concreto.
  // Vence con el legacy el 25/09/2026 — quitar esta rama en cuanto Smoobu resuelva el ticket o el
  // legacy deje de aceptarse. Solo se activa con SMOOBU_LEGACY_API_KEY puesta (fail-safe: sin esa
  // env, sigue como siempre por HMAC).
  const legacyKey = process.env.SMOOBU_LEGACY_API_KEY
  if (legacyKey && debeUsarPuenteLegacy(method, url, !!legacyKey)) {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
      'Api-Key': legacyKey,
      'Cache-Control': 'no-cache',
    }
    return fetch(url, { ...init, method, headers })
  }

  if (!secret) {
    // Sin secreto no se puede firmar HMAC. El puente legacy de arriba no salva este caso: solo
    // cubre GET /api/rates, y solo si SMOOBU_LEGACY_API_KEY está puesta. Se devuelve un 401 con
    // la CAUSA en vez de mandar una petición que va a fallar con un 401 indistinguible de «la
    // credencial es mala»: el sitio donde tocar es `pms_connections.smoobu_api_secret`.
    return new Response(
      JSON.stringify({ error: 'smoobu_sin_secreto', detail: 'Falta smoobu_api_secret (pms_connections / SMOOBU_API_SECRET): no se puede firmar HMAC.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { headers: auth } = firmarPeticion({ method, url, body, apiKey: key, apiSecret: secret })

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...auth,
    'Cache-Control': 'no-cache',
  }
  delete headers['Api-Key'] // esquema legacy: si algún caller lo arrastra, fuera
  if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return fetch(url, { ...init, method, headers })
}
