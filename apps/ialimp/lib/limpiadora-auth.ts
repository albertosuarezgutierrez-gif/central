// Valida la cookie `limpiadora_token` y devuelve la limpiadora + su empresa.
// Usar en las rutas /api/l/* que modifican datos, para no dejarlas anónimas
// y poder acotar por empresa.
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function getLimpiadoraSession(): Promise<{ limpiadora_id: string; empresa_id: string } | null> {
  const jar = await cookies()
  const token = jar.get('limpiadora_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT l.id::text AS limpiadora_id, l.empresa_id::text AS empresa_id
    FROM limpiadora_sessions s
    JOIN limpiadoras l ON l.id = s.limpiadora_id
    WHERE s.token::text = ${token} AND s.expires_at > now() AND l.activa = true
    LIMIT 1
  `)
  return rows[0] || null
}
