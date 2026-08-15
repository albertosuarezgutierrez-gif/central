import { prisma } from './db'

// Lectura del registro de accesos/actividad de ialimp (tabla compartida
// `registro_actividad`, la escribe apps/ialimp; prisma_plataforma solo SELECT).
// OJO regla de la casa: la tabla nació el 15/08/2026 — «sin filas» significa
// «sin registro desde entonces», nunca «no ha entrado». `desde` (min created_at)
// se pinta en la UI para que el hueco quede declarado.

export interface ActorResumen {
  actor_tipo: string
  actor_id: string | null
  actor_nombre: string | null
  empresa_id: string | null
  empresa_nombre: string | null
  ultima_actividad: string
  ultimo_login: string | null
  eventos: number
}

export interface FilaActividad {
  id: string
  empresa_id: string | null
  empresa_nombre: string | null
  actor_tipo: string
  actor_nombre: string | null
  accion: string
  metodo: string | null
  ruta: string | null
  detalle: string | null
  ip: string | null
  created_at: string
}

export async function getResumenActividad(): Promise<{
  actores: ActorResumen[]
  desde: string | null
  total: number
  empresas: Array<{ id: string; nombre: string }>
}> {
  const [actores, meta, empresas] = await Promise.all([
    prisma.$queryRaw<ActorResumen[]>`
      SELECT r.actor_tipo, r.actor_id::text AS actor_id, max(r.actor_nombre) AS actor_nombre,
             r.empresa_id::text AS empresa_id, max(e.nombre) AS empresa_nombre,
             max(r.created_at)::text AS ultima_actividad,
             max(r.created_at) FILTER (WHERE r.accion IN ('login', 'login_forzado'))::text AS ultimo_login,
             count(*)::int AS eventos
      FROM registro_actividad r
      LEFT JOIN empresas e ON e.id = r.empresa_id
      GROUP BY r.actor_tipo, r.actor_id, r.empresa_id
      ORDER BY max(r.created_at) DESC
      LIMIT 100
    `,
    prisma.$queryRaw<Array<{ desde: string | null; total: number }>>`
      SELECT min(created_at)::text AS desde, count(*)::int AS total FROM registro_actividad
    `,
    prisma.$queryRaw<Array<{ id: string; nombre: string }>>`
      SELECT id::text AS id, nombre FROM empresas WHERE activa = true ORDER BY nombre
    `,
  ])
  return { actores, desde: meta[0]?.desde ?? null, total: meta[0]?.total ?? 0, empresas }
}
