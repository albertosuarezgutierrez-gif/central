import { prisma } from './db'
import { estadoMigracion } from './estado-migracion'
import { resolverAmbito, type AmbitoCorreduria } from './tenant-ambito'

export { exigirCorreduriaId, explicarAmbito } from './tenant-ambito'
export type { AmbitoCorreduria } from './tenant-ambito'

/**
 * Resuelve a qué correduría pertenece la cuenta de la sesión.
 *
 * Desde el volcado del 02/09/2026 el vínculo existe: `seguros.usuarios` trae
 * los 17 usuarios del CRM de origen con su `correduria_id`, y la cuenta de la
 * casa (`public.cuentas`) se casa con ellos POR EMAIL, que es el único dato
 * común (el `auth_user_id` de origen es de Supabase Auth y aquí no significa
 * nada). Solo cuentan los usuarios `activo`.
 *
 * Mientras el schema no tenga datos (`migrado: false`) sigue siendo `pendiente`:
 * «no se sabe», no «no tiene». Con datos y sin correspondencia por email es
 * `sin-asignar`, que ahora SÍ es una ausencia comprobada.
 */
export async function ambitoActual(cuentaId: string): Promise<AmbitoCorreduria> {
  const migracion = await estadoMigracion()

  // Un fallo de consulta NO se degrada a «no migrado» en silencio: sin saber el
  // estado, el ámbito es «pendiente» y la UI lo dice. Nunca se sigue adelante.
  if (migracion.error || !migracion.migrado) return { estado: 'pendiente' }

  // Un fallo de lectura aquí tampoco se degrada a «sin-asignar»: sin saber el
  // vínculo, el ámbito es «pendiente». Un id inventado daría los datos de otro.
  let correduriaId: string | null
  try {
    const filas = await prisma.$queryRaw<{ correduria_id: string | null }[]>`
      select u.correduria_id::text as correduria_id
      from seguros.usuarios u
      join public.cuentas c on lower(c.email) = lower(u.email)
      where c.id = ${cuentaId}::uuid and u.activo
      order by u.rol = 'admin' desc, u.created_at asc
      limit 1
    `
    correduriaId = filas[0]?.correduria_id ?? null
  } catch {
    return { estado: 'pendiente' }
  }

  return resolverAmbito({ cuentaId, migrado: true, correduriaId })
}

/** Azúcar: el `correduriaId` de la sesión, o lanza. Ver `exigirCorreduriaId`. */
export async function correduriaIdActual(cuentaId: string): Promise<string> {
  const { exigirCorreduriaId } = await import('./tenant-ambito')
  return exigirCorreduriaId(await ambitoActual(cuentaId))
}

export { prisma }
