// Autorización de Edge Functions desplegadas con verify_jwt=false — fuente ÚNICA (02/11/2026).
//
// Con verify_jwt=false el gateway no comprueba nada: la función es una URL abierta. Este módulo
// da las dos puertas permitidas, ambas FAIL-CLOSED (sin la variable configurada no entra nadie)
// y con comparación en TIEMPO CONSTANTE (`===` corta en el primer carácter distinto y el tiempo
// de respuesta filtra cuánto prefijo se ha acertado):
//
//   - `exigirServicio(req)`: solo llamadas servidor→servidor con la clave de servicio de Supabase
//     (la nueva `sb_secret_…` de SUPABASE_SECRET_KEYS o la legacy SUPABASE_SERVICE_ROLE_KEY),
//     en `apikey` o en `Authorization: Bearer`. Es lo que ya mandan `cabecerasServicio()`,
//     `supabase.functions.invoke()` con cliente de servicio y las rutas de ia-rest.
//   - `exigirServicioOSecreto(req, 'NOMBRE_ENV', cabecera?)`: lo anterior O un secreto propio
//     (variable de entorno de Edge Functions) en la cabecera `x-internal-secret` (por defecto).
//     Para pg_cron (no tiene la clave de servicio: la lee del Vault) y para ia-rest/tg-send.
//
//   - `secretoEnValor(valor, 'NOMBRE_ENV')`: para una página HTML que se abre en el navegador con
//     el secreto en la query (ia-training-dashboard). Mismo fail-closed y tiempo constante.
//
// Las dos `exigir…` devuelven `null` si autoriza o una `Response` 401/503 lista para devolver.
// Lo vigila test/regression-edge-functions-auth.test.ts. Nunca un secreto como literal aquí.

export type LeerEnv = (nombre: string) => string | undefined

const leerDeno: LeerEnv = (n) => Deno.env.get(n)

function noVacia(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t === "" ? null : t
}

/** Comparación en tiempo constante (recorre siempre la longitud mayor). */
export function igualesTiempoConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  const n = Math.max(ea.length, eb.length)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

/** Claves de servicio válidas ahora mismo: todas las de SUPABASE_SECRET_KEYS + la legacy. */
export function clavesDeServicio(env: LeerEnv = leerDeno): string[] {
  const out: string[] = []
  const bruto = env("SUPABASE_SECRET_KEYS")
  if (bruto) {
    try {
      const obj = JSON.parse(bruto)
      if (obj && typeof obj === "object") {
        for (const v of Object.values(obj as Record<string, unknown>)) {
          const c = noVacia(typeof v === "string" ? v : null)
          if (c) out.push(c)
        }
      }
    } catch { /* JSON ilegible: no aporta claves */ }
  }
  const legacy = noVacia(env("SUPABASE_SERVICE_ROLE_KEY"))
  if (legacy) out.push(legacy)
  return out
}

/** Credenciales que trae la petición: `apikey` y el token de `Authorization: Bearer`. */
function credencialesPresentadas(h: Headers): string[] {
  const out: string[] = []
  const apikey = noVacia(h.get("apikey"))
  if (apikey) out.push(apikey)
  const m = /^Bearer\s+(.+)$/i.exec(h.get("authorization") ?? "")
  const bearer = noVacia(m?.[1])
  if (bearer) out.push(bearer)
  return out
}

function coincideAlguna(presentadas: string[], validas: string[]): boolean {
  let ok = false
  // Sin cortocircuito: se comparan todas las parejas.
  for (const p of presentadas) for (const v of validas) ok = igualesTiempoConstante(p, v) || ok
  return ok
}

/** true si la petición trae la clave de servicio. Sin claves configuradas → false. */
export function esLlamadaDeServicio(h: Headers, env: LeerEnv = leerDeno): boolean {
  const validas = clavesDeServicio(env)
  if (validas.length === 0) return false
  return coincideAlguna(credencialesPresentadas(h), validas)
}

/** true si `cabecera` coincide con la variable `nombreEnv`. Variable ausente/vacía → false. */
export function secretoValido(h: Headers, nombreEnv: string, cabecera = "x-internal-secret", env: LeerEnv = leerDeno): boolean {
  const esperado = noVacia(env(nombreEnv))
  const recibido = noVacia(h.get(cabecera))
  if (!esperado || !recibido) return false
  return igualesTiempoConstante(recibido, esperado)
}

/** true si `valor` (p. ej. un parámetro de query de una página que abre el navegador) coincide
 *  con la variable `nombreEnv`. Variable ausente/vacía → false (fail-closed). */
export function secretoEnValor(valor: string | null | undefined, nombreEnv: string, env: LeerEnv = leerDeno): boolean {
  const esperado = noVacia(env(nombreEnv))
  const recibido = noVacia(valor)
  if (!esperado || !recibido) return false
  return igualesTiempoConstante(recibido, esperado)
}

const JSON_H = { "Content-Type": "application/json" }

function denegar(extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...JSON_H, ...extra } })
}

/** Solo clave de servicio. `null` = autorizado; si no, la Response a devolver. */
export function exigirServicio(req: Request, cabecerasExtra: Record<string, string> = {}, env: LeerEnv = leerDeno): Response | null {
  return esLlamadaDeServicio(req.headers, env) ? null : denegar(cabecerasExtra)
}

/** Clave de servicio O secreto propio `nombreEnv` en `cabecera`. `null` = autorizado. */
export function exigirServicioOSecreto(
  req: Request,
  nombreEnv: string,
  cabecera = "x-internal-secret",
  cabecerasExtra: Record<string, string> = {},
  env: LeerEnv = leerDeno,
): Response | null {
  if (esLlamadaDeServicio(req.headers, env)) return null
  if (secretoValido(req.headers, nombreEnv, cabecera, env)) return null
  return denegar(cabecerasExtra)
}
