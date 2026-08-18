import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Registro de accesos y actividad (tabla registro_actividad, BD compartida).
// Lo consume el god-panel de plataforma (/operador/actividad).

export type ActorTipo = 'owner' | 'usuario' | 'limpiadora' | 'propietario'

export interface EventoActividad {
  empresa_id?: string | null
  actor_tipo: ActorTipo
  actor_id?: string | null
  actor_nombre?: string | null
  accion: string // login | login_forzado | pagina | accion
  metodo?: string | null
  ruta?: string | null
  detalle?: string | null
  ip?: string | null
  user_agent?: string | null
}

// Best-effort: el historial nunca puede romper la petición que lo origina.
export async function registrarActividad(ev: EventoActividad): Promise<void> {
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO registro_actividad
        (empresa_id, actor_tipo, actor_id, actor_nombre, accion, metodo, ruta, detalle, ip, user_agent)
      VALUES
        (${ev.empresa_id ?? null}::uuid, ${ev.actor_tipo}, ${ev.actor_id ?? null}::uuid, ${ev.actor_nombre ?? null},
         ${ev.accion}, ${ev.metodo ?? null}, ${ev.ruta ?? null}, ${ev.detalle ?? null},
         ${ev.ip ?? null}, ${ev.user_agent ?? null})
    `)
  } catch {
    // best-effort
  }
}

export function ipDe(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
}

export function uaDe(req: Request): string | null {
  return req.headers.get('user-agent')
}
