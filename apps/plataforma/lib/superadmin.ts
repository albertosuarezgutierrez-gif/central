// Auth del PANEL DE OPERADOR (god-panel) — identidad de superadmin.
// Reutiliza la tabla `superadmins` que ya existe en la BD compartida (la misma
// que usa el /superadmin de ialimp) → un solo login gobierna toda la casa de marcas.
// Cookie SEPARADA de la sesión de cuenta (plataforma_session) para no mezclar.

import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { prisma } from './db'

export const ADMIN_COOKIE = 'plataforma_admin'
export const ADMIN_COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 } as const

function secret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_SECRET no configurado') })()
      : 'plataforma-dev-secret-change-in-prod'),
  )
}

export interface AdminPayload { id: string; email: string }

export async function createAdminToken(id: string, email: string): Promise<string> {
  return new SignJWT({ email, rol: 'superadmin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret())
}

// Edge-safe (solo jose): la usa el middleware para gatear /admin.
export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.rol !== 'superadmin' || !payload.sub) return null
    return { id: payload.sub as string, email: payload.email as string }
  } catch {
    return null
  }
}

// Valida credenciales contra `superadmins` (bcrypt). Si la cuenta aún no tiene
// contraseña (primer acceso), la fija con la que se introduce. Devuelve la fila o null.
export async function loginAdmin(email: string, password: string): Promise<{ id: string; email: string } | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string; email: string; password_hash: string | null; activo: boolean }>>`
    SELECT id, email, password_hash, activo FROM superadmins WHERE lower(email) = lower(${email}) LIMIT 1
  `
  const sa = rows[0]
  if (!sa || !sa.activo) return null
  if (!sa.password_hash) {
    const hash = await bcrypt.hash(password, 12)
    await prisma.$executeRaw`UPDATE superadmins SET password_hash = ${hash} WHERE id = ${sa.id}::uuid`
    return { id: sa.id, email: sa.email }
  }
  const ok = await bcrypt.compare(password, sa.password_hash)
  return ok ? { id: sa.id, email: sa.email } : null
}

// Lee la sesión de operador desde la cookie y confirma que sigue activo en BD.
export async function getAdmin(): Promise<{ id: string; email: string; nombre: string } | null> {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value
  if (!token) return null
  const p = await verifyAdminToken(token)
  if (!p) return null
  const rows = await prisma.$queryRaw<Array<{ activo: boolean; nombre: string | null }>>`
    SELECT activo, nombre FROM superadmins WHERE id = ${p.id}::uuid LIMIT 1
  `
  if (!rows[0]?.activo) return null
  return { id: p.id, email: p.email, nombre: rows[0].nombre || p.email }
}

export async function requireAdmin() {
  const a = await getAdmin()
  if (!a) throw new Error('No autorizado')
  return a
}
