// Línea base semanal — la parte con RED y BD (solo desde la ruta API). Lo puro está en
// `linea-base-correduria.ts`.
import { prisma } from '@/lib/db'
import { cabecerasPuerto } from './puerto-actor.ts'
import type { Conteos } from './linea-base-correduria.ts'

/**
 * Correos de correduría por semana (lunes de Madrid), desde `desde`. Cuenta lo que el triaje
 * clasificó como de la correduría, venga por regla o por IA. `null` = no se pudo consultar.
 */
export async function correosPorSemana(desde: Date): Promise<Conteos | null> {
  try {
    const filas = await prisma.$queryRaw<{ semana: string; n: number }[]>`
      SELECT to_char(date_trunc('week', created_at AT TIME ZONE 'Europe/Madrid'), 'YYYY-MM-DD') AS semana,
             count(*)::int AS n
        FROM correo_triaje
       WHERE created_at >= ${desde}
         AND (categoria LIKE 'correduria%' OR categoria = 'asociacion-corredores')
       GROUP BY 1`
    return Object.fromEntries(filas.map((f) => [f.semana, Number(f.n)]))
  } catch {
    return null
  }
}

export async function lineaBaseAsegura(): Promise<{ status: number; json: unknown }> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/operador/linea-base`, {
      headers: await cabecerasPuerto(secret),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
