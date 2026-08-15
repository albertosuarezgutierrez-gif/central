import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export type AyudaCliente = {
  id: string
  titulo: string
  organismo: string | null
  cuantia_texto: string | null
  encaje: string | null
  url: string | null
  plazo_fin: Date | null
}

// Ayudas/subvenciones vigentes detectadas por el radar del grupo para ESTE tenant
// (fiscal_ayudas + ayudas_perfiles, BD compartida; ref_ext = cuentas.id de esta app).
// plazo_fin NULL = plazo por confirmar: se muestra igualmente, nunca se oculta.
export async function ayudasVigentes(cuentaId: string): Promise<AyudaCliente[]> {
  try {
    return await prisma.$queryRaw<AyudaCliente[]>(Prisma.sql`
      SELECT a.id, a.titulo, a.organismo, a.cuantia_texto, a.encaje, a.url, a.plazo_fin
      FROM fiscal_ayudas a
      JOIN ayudas_perfiles p ON p.tenant = a.tenant AND p.activo
      WHERE p.ref_ext = ${cuentaId}
        AND a.descartado = false
        AND (a.plazo_fin IS NULL OR a.plazo_fin >= CURRENT_DATE)
      ORDER BY a.plazo_fin ASC NULLS LAST
      LIMIT 3
    `)
  } catch {
    // Sin las tablas del radar (u otro fallo de lectura) el panel no se cae: sin banner.
    return []
  }
}

export function diasRestantes(plazoFin: Date | null): number | null {
  if (!plazoFin) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.round((plazoFin.getTime() - hoy.getTime()) / 86_400_000)
}
