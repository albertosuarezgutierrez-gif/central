import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_SECRET no configurado en producción') })()
      : 'ialimp-dev-secret-change-in-prod')
)

// Sesión única: el jti del token debe coincidir con el guardado en la cuenta.
// Si la cuenta aún no tiene jti (tokens previos a la función), se permite (no
// desloguear a todos de golpe). Fail-open ante error de BD.
async function sessionJtiOk(p: any): Promise<boolean> {
  try {
    let rows: any[]
    if (p.type === 'usuario' && p.usuario_id) {
      rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT session_jti FROM usuarios_empresa WHERE id = ${p.usuario_id}::uuid LIMIT 1`)
    } else if (p.empresa_id) {
      rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT session_jti FROM empresas WHERE id = ${p.empresa_id}::uuid LIMIT 1`)
    } else {
      return true
    }
    const dbJti = rows[0]?.session_jti
    if (!dbJti) return true
    return p.jti === dbJti
  } catch {
    return true
  }
}

export interface SessionPayload {
  empresa_id?:   string
  usuario_id?:   string
  superadmin_id?: string
  email?:        string
  rol:           string         // owner | admin | supervisor | superadmin
  modulos?:      string[]
  type?:         string
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('ialimp_session')?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, JWT_SECRET)
    const p = payload as any
    // Superadmin: fuera del control de sesión única (por ahora).
    if (p.rol === 'superadmin' || p.type === 'superadmin') return p as SessionPayload
    if (!(await sessionJtiOk(p))) return null
    return p as SessionPayload
  } catch {
    return null
  }
}

export async function getEmpresaId(): Promise<string | null> {
  const s = await getSession()
  return s?.empresa_id || null
}

export async function requireEmpresaId(): Promise<string> {
  const id = await getEmpresaId()
  if (!id) throw new Error('No autenticado')
  return id
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession()
  if (!s) throw new Error('No autenticado')
  return s
}

export async function isSuperadmin(): Promise<boolean> {
  const s = await getSession()
  return s?.rol === 'superadmin'
}

export async function isOwner(): Promise<boolean> {
  const s = await getSession()
  return s?.rol === 'owner'
}

// Comprueba si la sesión tiene acceso a un módulo concreto
// Owner siempre tiene acceso a todo
export async function hasModulo(modulo: string): Promise<boolean> {
  const s = await getSession()
  if (!s) return false
  if (s.rol === 'owner' || s.rol === 'superadmin') return true
  return (s.modulos || []).includes(modulo)
}
