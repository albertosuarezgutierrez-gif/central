import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'

// Valida la cookie `limpiadora_token` contra `limpiadora_sessions` (token vivo + limpiadora activa).
// Reutiliza la misma query que el GET de /api/limpiadoras/auth. Devuelve la limpiadora o null.
export async function getLimpiadoraFromCookie(): Promise<
  { id: string; nombre: string; propiedades: any; color: string } | null
> {
  const token = (await cookies()).get('limpiadora_token')?.value
  if (!token) return null
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT l.id, l.nombre, l.propiedades, l.color
      FROM limpiadora_sessions s
      JOIN limpiadoras l ON l.id = s.limpiadora_id
      WHERE s.token = ${token} AND s.expires_at > now() AND l.activa = true
      LIMIT 1
    `)
    return rows[0] || null
  } catch {
    return null
  }
}

// Autorización para endpoints `/api/limpiadoras/*`: vale un token de limpiadora VÁLIDO
// (no solo que la cookie exista, como hace el middleware) O una sesión de admin de NextAuth.
// Devuelve true si autorizado. Los handlers responden 401 si es false.
export async function isLimpiadoraAuthorized(): Promise<boolean> {
  const limp = await getLimpiadoraFromCookie()
  if (limp) return true
  const session = await auth().catch(() => null)
  return !!session?.user
}
