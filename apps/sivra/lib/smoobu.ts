import { prisma } from "@/lib/prisma"
import { firmarPeticion } from "@/lib/smoobu-firma"

// Fuente ÚNICA de credenciales de Smoobu para sivra.
//
// La key vive en la BD compartida, en `pms_connections` (tabla propiedad de ialimp):
// es la MISMA conexión que usan las limpiezas. Así se rota en un solo sitio (la UI de
// ialimp) y sivra la recoge sin tocar variables de entorno ni redeploys.
//
// Respaldo: si la BD no responde, cae a `process.env.SMOOBU_API_KEY` / `SMOOBU_API_SECRET`.
//
// `pms_connections` es multi-tenant, así que seleccionamos la fila de Alberto por `id`
// (no "la primera activa"), para no coger la key de otro cliente cuando ialimp crezca.
//
// 🔑 AUTENTICACIÓN: **HMAC-SHA256** (`X-API-Key` + `X-Timestamp` + `X-Nonce` + `X-Signature`).
// El esquema legacy (header `Api-Key` con la key plana) lo deprecó Smoobu y ya devuelve 401;
// sunset 25/09/2026. La firma vive en el módulo PURO `lib/smoobu-firma.ts`, contrastado con el
// ejemplo oficial. Usa SIEMPRE `smoobuFetch`, nunca `fetch` directo.
const CONNECTION_ID =
  process.env.SMOOBU_PMS_CONNECTION_ID ?? "c8c1fb07-8538-4656-8e09-9546e9014a25"
const BASE = "https://login.smoobu.com"

type Credenciales = { key: string; secret: string }

let cache: { cred: Credenciales; at: number } | null = null
const TTL_MS = 5 * 60_000

export async function getSmoobuCredenciales(): Promise<Credenciales> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cred
  let key = ""
  let secret = ""
  try {
    const rows = await prisma.$queryRaw<
      { smoobu_api_key: string | null; smoobu_api_secret: string | null }[]
    >`
      SELECT smoobu_api_key, smoobu_api_secret
      FROM pms_connections
      WHERE id = ${CONNECTION_ID}::uuid AND activa = true
      LIMIT 1
    `
    key = rows?.[0]?.smoobu_api_key?.trim() ?? ""
    secret = rows?.[0]?.smoobu_api_secret?.trim() ?? ""
  } catch {
    // BD no disponible → respaldo al env
  }
  if (!key) key = process.env.SMOOBU_API_KEY ?? ""
  if (!secret) secret = process.env.SMOOBU_API_SECRET ?? ""
  const cred = { key, secret }
  cache = { cred, at: Date.now() }
  return cred
}

/**
 * Sigue exportada porque varias rutas la usan solo para comprobar «¿hay key configurada?».
 * Para HABLAR con Smoobu, `smoobuFetch`.
 */
export async function getSmoobuKey(): Promise<string> {
  return (await getSmoobuCredenciales()).key
}

/**
 * fetch a Smoobu firmado con HMAC-SHA256. `pathOrUrl` puede ser ruta ('/api/...') o URL completa.
 * La URL y el cuerpo que se firman son EXACTAMENTE los que se envían.
 */
export async function smoobuFetch(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const { key, secret } = await getSmoobuCredenciales()
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : BASE + pathOrUrl
  const method = (init.method ?? "GET").toUpperCase()
  const body = typeof init.body === "string" ? init.body : undefined

  if (!secret) {
    // Sin secreto no se puede firmar, y el legacy ya no lo acepta Smoobu. 401 CON la causa, en vez
    // de un 401 de Smoobu indistinguible de «la credencial es mala».
    return new Response(
      JSON.stringify({ error: "smoobu_sin_secreto", detail: "Falta smoobu_api_secret (pms_connections / SMOOBU_API_SECRET): no se puede firmar HMAC." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )
  }

  const { headers: auth } = firmarPeticion({ method, url, body, apiKey: key, apiSecret: secret })

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...auth,
    "Cache-Control": "no-cache",
  }
  delete headers["Api-Key"] // esquema legacy: si algún caller lo arrastra, fuera
  if (body && !headers["Content-Type"]) headers["Content-Type"] = "application/json"
  return fetch(url, { ...init, method, headers })
}
