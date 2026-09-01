import { prisma } from './db'
import { estadoMigracion } from './estado-migracion'
import { resolverAmbito, type AmbitoCorreduria } from './tenant-ambito'

export { exigirCorreduriaId, explicarAmbito } from './tenant-ambito'
export type { AmbitoCorreduria } from './tenant-ambito'

/**
 * Resuelve a qué correduría pertenece la cuenta de la sesión.
 *
 * Hoy devuelve SIEMPRE `pendiente`, porque la tabla que vincula cuenta ↔
 * correduría vive en el schema `seguros` y todavía no existe. Eso es correcto y
 * es el punto: hasta que llegue el dump, el ámbito es «no se sabe», y ninguna
 * pantalla debe pintar cifras.
 *
 * Cuando el schema esté migrado hay que sustituir el `null` de abajo por la
 * consulta real. La forma de la respuesta no cambia.
 */
export async function ambitoActual(cuentaId: string): Promise<AmbitoCorreduria> {
  const migracion = await estadoMigracion()

  // Un fallo de consulta NO se degrada a «no migrado» en silencio: sin saber el
  // estado, el ámbito es «pendiente» y la UI lo dice. Nunca se sigue adelante.
  if (migracion.error || !migracion.migrado) return { estado: 'pendiente' }

  // TODO(fase-1): leer el vínculo real cuando exista la tabla en `seguros`.
  // Mientras no exista, `null` significa «no vinculada», que es la verdad.
  const correduriaId: string | null = null

  return resolverAmbito({ cuentaId, migrado: true, correduriaId })
}

/** Azúcar: el `correduriaId` de la sesión, o lanza. Ver `exigirCorreduriaId`. */
export async function correduriaIdActual(cuentaId: string): Promise<string> {
  const { exigirCorreduriaId } = await import('./tenant-ambito')
  return exigirCorreduriaId(await ambitoActual(cuentaId))
}

export { prisma }
