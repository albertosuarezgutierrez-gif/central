// Módulos apagados por el operador (god-panel) para esta empresa.
// Lee `tenant_modulos` (BD compartida). Sin filas = nada apagado (opt-out) →
// no afecta a las empresas existentes hasta que el operador desactive algo.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function getModulosOff(empresa_id: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<Array<{ modulo: string }>>(Prisma.sql`
      SELECT modulo FROM tenant_modulos
      WHERE vertical = 'ialimp' AND ref = ${empresa_id}::text AND activo = false
    `)
    return rows.map(r => r.modulo)
  } catch {
    return []
  }
}
