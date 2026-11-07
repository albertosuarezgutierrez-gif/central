// Token de TRASPASO de «Mi empresa» a una app (contabilidad, rrhh…): un solo uso, 60 s, HS256 FIJO. PURO (Web Crypto).
//
// Qué NO hace: autorizar. Solo dice «esta persona, con este correo verificado, viene de Mi empresa hacia ESTA app y
// ESTA empresa». La app destino (`/api/auth/traspaso`) además:
//   1. consume el `jti` en SU tabla `traspasos_usados` (PK: repetido = 401),
//   2. busca a la persona por email en SU tabla y exige SU `usuario_empresas` para `ref`.
// Secreto POR APP DESTINO (`HERRAMIENTAS_TRASPASO_SECRET_<APP>`, requireSecret en quien llama): uno filtrado no abre las demás.
//
// Cepos (traspaso.test.ts): `aud` ajeno, expirado, `alg:none`/otro alg, firma con el secreto de otra app, `typ` distinto,
// `iss` distinto, carga manipulada, token de empleado.

export const ISS_TRASPASO = 'empresa.grupoasegura.es'
export const TYP_TRASPASO = 'traspaso_empresa'
export const VIDA_TRASPASO_S = 60
export type AudTraspaso = 'contabilidad' | 'rrhh' | 'taller'
export const envSecretoTraspaso = (aud: AudTraspaso) => `HERRAMIENTAS_TRASPASO_SECRET_${aud.toUpperCase()}`

export type CargaTraspaso = {
  iss: typeof ISS_TRASPASO
  aud: AudTraspaso
  typ: typeof TYP_TRASPASO
  /** id de la persona en «Mi empresa» (solo trazabilidad). */
  sub: string
  /** correo VERIFICADO por OTP en Mi empresa: la app destino busca a SU usuario por él. */
  email: string
  /** id de la empresa EN la app destino (`ref_externa`). */
  ref: string
  jti: string
  iat: number
  exp: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
const utf8 = (s: string) => new TextEncoder().encode(s)

async function hmac(secreto: string, datos: string): Promise<Uint8Array> {
  if (!secreto || secreto.length < 32) throw new Error('secreto de traspaso ausente o corto (≥32 caracteres)')
  const clave = await crypto.subtle.importKey('raw', utf8(secreto) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', clave, utf8(datos) as BufferSource))
}

function igualesTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}

const CABECERA = b64url(utf8(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))

export async function firmarTraspaso(
  d: { aud: AudTraspaso; sub: string; email: string; ref: string; jti: string }, secreto: string, ahora = new Date(),
): Promise<string> {
  if (!UUID.test(d.jti) || !UUID.test(d.ref) || !UUID.test(d.sub)) throw new Error('jti, ref y sub deben ser uuid')
  const iat = Math.floor(ahora.getTime() / 1000)
  const carga: CargaTraspaso = { iss: ISS_TRASPASO, aud: d.aud, typ: TYP_TRASPASO, sub: d.sub, email: d.email.trim().toLowerCase(), ref: d.ref.toLowerCase(), jti: d.jti.toLowerCase(), iat, exp: iat + VIDA_TRASPASO_S }
  const cuerpo = `${CABECERA}.${b64url(utf8(JSON.stringify(carga)))}`
  return `${cuerpo}.${b64url(await hmac(secreto, cuerpo))}`
}

export type ErrorTraspaso = 'formato' | 'alg' | 'firma' | 'iss' | 'aud' | 'typ' | 'expirado' | 'carga'
export type ResultadoTraspaso = { ok: true; carga: CargaTraspaso } | { ok: false; error: ErrorTraspaso }

/** Verifica TODO salvo el `jti` (eso lo consume la app en su BD). Falla cerrado ante cualquier duda. */
export async function verificarTraspaso(token: unknown, audEsperada: AudTraspaso, secreto: string, ahora = new Date()): Promise<ResultadoTraspaso> {
  if (typeof token !== 'string' || token.length > 4096) return { ok: false, error: 'formato' }
  const partes = token.split('.')
  if (partes.length !== 3 || partes.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return { ok: false, error: 'formato' }
  let cab: Record<string, unknown>
  let carga: Record<string, unknown>
  try {
    cab = JSON.parse(new TextDecoder().decode(deB64url(partes[0])))
    carga = JSON.parse(new TextDecoder().decode(deB64url(partes[1])))
  } catch {
    return { ok: false, error: 'formato' }
  }
  // alg FIJO: ni `none`, ni RS/ES (confusión de algoritmo), ni nada que no sea exactamente HS256.
  if (cab?.alg !== 'HS256') return { ok: false, error: 'alg' }
  let esperada: Uint8Array
  try { esperada = await hmac(secreto, `${partes[0]}.${partes[1]}`) } catch { return { ok: false, error: 'firma' } }
  let recibida: Uint8Array
  try { recibida = deB64url(partes[2]) } catch { return { ok: false, error: 'formato' } }
  if (!igualesTiempoConstante(esperada, recibida)) return { ok: false, error: 'firma' }
  if (carga.iss !== ISS_TRASPASO) return { ok: false, error: 'iss' }
  if (carga.aud !== audEsperada) return { ok: false, error: 'aud' }
  if (carga.typ !== TYP_TRASPASO) return { ok: false, error: 'typ' }
  const s = Math.floor(ahora.getTime() / 1000)
  if (typeof carga.exp !== 'number' || typeof carga.iat !== 'number' || carga.exp <= s || carga.iat > s + 5 || carga.exp - carga.iat > VIDA_TRASPASO_S) {
    return { ok: false, error: 'expirado' }
  }
  if (typeof carga.jti !== 'string' || !UUID.test(carga.jti) || typeof carga.ref !== 'string' || !UUID.test(carga.ref)
    || typeof carga.sub !== 'string' || !UUID.test(carga.sub) || typeof carga.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(carga.email)) {
    return { ok: false, error: 'carga' }
  }
  return { ok: true, carga: carga as unknown as CargaTraspaso }
}
