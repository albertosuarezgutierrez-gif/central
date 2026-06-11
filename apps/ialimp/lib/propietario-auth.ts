// Utilidades server-only para el login de propietario.
// OJO: no importar desde middleware (usa Web Crypto / cookies); solo desde
// route handlers y server components.
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { genHex, sha256Hex } from '@central/core-identity'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_SECRET no configurado en producción') })()
      : 'ialimp-dev-secret-change-in-prod')
)

export interface PropietarioSession {
  cliente_id: string
  empresa_id: string
  email?: string
}

// Lee la cookie `ialimp_prop` y devuelve la sesión del propietario (o null).
export async function getPropietarioSession(): Promise<PropietarioSession | null> {
  try {
    const store = await cookies()
    const token = store.get('ialimp_prop')?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (payload.type !== 'propietario' || !payload.cliente_id) return null
    // Sesión única: el jti debe coincidir con clientes.session_jti (si existe).
    try {
      const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT session_jti FROM clientes WHERE id = ${String(payload.cliente_id)}::uuid LIMIT 1`)
      const dbJti = rows[0]?.session_jti
      if (dbJti && (payload as any).jti !== dbJti) return null
    } catch { /* fail-open */ }
    return {
      cliente_id: String(payload.cliente_id),
      empresa_id: String(payload.empresa_id || ''),
      email: payload.email ? String(payload.email) : undefined,
    }
  } catch {
    return null
  }
}

export { genHex, sha256Hex }

// ── Rate limiter en memoria (por proceso) ────────────────────────────
const attempts = new Map<string, { count: number; resetAt: number }>()

export function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd?.split(',')[0] || 'unknown').trim()
}

export function rateLimit(
  key: string, max = 5, windowMs = 15 * 60 * 1000
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }
  if (entry.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  entry.count++
  return { allowed: true }
}
