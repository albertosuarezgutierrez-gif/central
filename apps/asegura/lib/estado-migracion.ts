import { prisma } from './db'
import { decidirMigracion, type EstadoMigracion } from './migracion-decision'

export { explicarMigracion } from './migracion-decision'
export type { EstadoMigracion } from './migracion-decision'

/**
 * ¿Se ha restaurado ya la cartera en el schema `seguros`?
 *
 * Este fichero solo CONSULTA. La regla de qué cuenta como «migrado» —y por qué
 * contar tablas no vale— vive en `migracion-decision.ts`, que es puro y probado.
 *
 * 🚨 Consulta `seguros.corredurias`, no `seguros.clientes`: es el dato que de
 * verdad hace falta (sin correduría no hay a qué vincular la cuenta) y no toca
 * datos personales de nadie.
 */
export async function estadoMigracion(): Promise<EstadoMigracion> {
  let tablas = 0
  try {
    const filas = await prisma.$queryRaw<{ n: bigint }[]>`
      select count(*)::bigint as n
      from information_schema.tables
      where table_schema = 'seguros' and table_type = 'BASE TABLE'
    `
    tablas = Number(filas[0]?.n ?? 0)
  } catch {
    // No colapsamos el fallo a «no hay nada»: lo marcamos como error explícito.
    return decidirMigracion({ tablas: 0, corredurias: 0, error: true })
  }

  // Sin tablas no hay nada que contar, y preguntarlo daría un error de SQL que
  // se confundiría con un fallo de conexión.
  if (tablas === 0) return decidirMigracion({ tablas: 0, corredurias: 0, error: false })

  try {
    const filas = await prisma.$queryRaw<{ n: bigint }[]>`
      select count(*)::bigint as n from seguros.corredurias
    `
    return decidirMigracion({ tablas, corredurias: Number(filas[0]?.n ?? 0), error: false })
  } catch {
    // La tabla existe pero no se pudo leer (permisos, conexión). Eso NO es
    // «no hay corredurías»: es que no lo sabemos.
    return decidirMigracion({ tablas, corredurias: 0, error: true })
  }
}
