// Limitador de intentos respaldado en BD (sirve en serverless, a diferencia del
// de memoria por proceso). Clave por IP+scope, p.ej. "l:1.2.3.4" o "admin:1.2.3.4".
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Cuenta un intento. Devuelve { allowed:false, retryAfter } si está bloqueado.
// Fail-open: ante error de BD no bloquea (no dejar gente fuera por un hipo).
export async function rateLimitHit(
  key: string, max = 5, windowMin = 15
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT intentos, ventana_inicio, bloqueado_hasta FROM auth_rate_limit WHERE key = ${key} LIMIT 1
    `)
    const now = Date.now()
    const r = rows[0]
    if (r?.bloqueado_hasta && new Date(r.bloqueado_hasta).getTime() > now) {
      return { allowed: false, retryAfter: Math.ceil((new Date(r.bloqueado_hasta).getTime() - now) / 1000) }
    }
    const windowMs = windowMin * 60 * 1000
    const ventanaCaducada = !r || (r.ventana_inicio && now - new Date(r.ventana_inicio).getTime() > windowMs)
    if (ventanaCaducada) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO auth_rate_limit (key, intentos, ventana_inicio, bloqueado_hasta)
        VALUES (${key}, 1, now(), NULL)
        ON CONFLICT (key) DO UPDATE SET intentos = 1, ventana_inicio = now(), bloqueado_hasta = NULL
      `)
      return { allowed: true }
    }
    const nuevos = (r.intentos || 0) + 1
    if (nuevos >= max) {
      const secs = Math.ceil(windowMs / 1000)
      await prisma.$executeRaw(Prisma.sql`
        UPDATE auth_rate_limit SET intentos = ${nuevos}, bloqueado_hasta = now() + make_interval(secs => ${secs})
        WHERE key = ${key}
      `)
      return { allowed: false, retryAfter: secs }
    }
    await prisma.$executeRaw(Prisma.sql`UPDATE auth_rate_limit SET intentos = ${nuevos} WHERE key = ${key}`)
    return { allowed: true }
  } catch {
    return { allowed: true }
  }
}

// Resetea el contador (al acertar las credenciales).
export async function rateLimitClear(key: string): Promise<void> {
  try { await prisma.$executeRaw(Prisma.sql`DELETE FROM auth_rate_limit WHERE key = ${key}`) } catch {}
}

// IP del cliente desde la request.
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd?.split(',')[0] || 'unknown').trim()
}
