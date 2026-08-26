import { prisma } from './db'

/**
 * ¿Se ha restaurado ya la cartera en el schema `seguros`?
 *
 * Helper PURO de estado, deliberadamente separado del JSX (patrón de
 * `apps/plataforma/lib/subastas/resumen-docs.ts`). Existe para que la UI pueda
 * distinguir TRES cosas y no dos:
 *   - `migrado: false`  → «todavía no se sabe»: el schema está vacío porque no se
 *                         ha migrado, NO porque la correduría no tenga clientes.
 *   - `migrado: true` con tablas → el dato ya vive aquí.
 *   - error de consulta → se propaga como `false` PERO con `error: true`, para que
 *                         un fallo de red no se pinte como «todo en orden».
 */
export type EstadoMigracion = { migrado: boolean; tablas: number; error: boolean }

export async function estadoMigracion(): Promise<EstadoMigracion> {
  try {
    const filas = await prisma.$queryRaw<{ n: bigint }[]>`
      select count(*)::bigint as n
      from information_schema.tables
      where table_schema = 'seguros' and table_type = 'BASE TABLE'
    `
    const tablas = Number(filas[0]?.n ?? 0)
    return { migrado: tablas > 0, tablas, error: false }
  } catch {
    // No colapsamos el fallo a «no hay nada»: lo marcamos como error explícito.
    return { migrado: false, tablas: 0, error: true }
  }
}
