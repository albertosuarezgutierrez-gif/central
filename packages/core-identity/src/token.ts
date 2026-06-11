// Fábrica de tokens de sesión (jose/JWT HS256) compartida por la casa de marcas.
// Centraliza el patrón que hoy duplican ialimp y plataforma: firmar un JWT con un
// `jti` de revocación (sesión única por usuario) y verificarlo. Cada app define qué
// claims mete (userId/tenantId/role/email/type…) y con qué secreto.
//
// Edge/serverless-safe: jose funciona en Node y en el runtime edge.
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { genJti } from './crypto'

export interface TokenResult {
  /** JWT firmado, listo para la cookie/cabecera. */
  token: string
  /** `jti` incrustado — guárdalo en BD para la sesión única (revocación). */
  jti: string
}

export interface CreateSessionTokenOpts {
  /** Claims a incrustar (p. ej. `{ userId, tenantId, role, email, type }`). */
  claims: JWTPayload
  /** Secreto HS256 (string). En producción, env (`JWT_SECRET`). */
  secret: string
  /** Caducidad (p. ej. `'7d'`, `'30d'`). Por defecto `'7d'`. */
  expiresIn?: string
  /** `jti` a usar; si se omite, se genera uno nuevo (`genJti`). */
  jti?: string
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

/** Firma un JWT de sesión con `jti` (devuelve token + jti para persistir). */
export async function createSessionToken(opts: CreateSessionTokenOpts): Promise<TokenResult> {
  const jti = opts.jti ?? genJti()
  const token = await new SignJWT({ ...opts.claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '7d')
    .sign(key(opts.secret))
  return { token, jti }
}

/** Verifica un JWT de sesión; devuelve el payload o `null` si es inválido/expirado. */
export async function verifySessionToken<T extends JWTPayload = JWTPayload>(
  token: string,
  secret: string,
): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret))
    return payload as T
  } catch {
    return null
  }
}
