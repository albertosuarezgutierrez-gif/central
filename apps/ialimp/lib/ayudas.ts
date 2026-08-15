import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type AyudaEmpresa = {
  id: string
  titulo: string
  organismo: string | null
  cuantia_texto: string | null
  encaje: string | null
  url: string | null
  plazo_fin: Date | null
}

// Ayudas/subvenciones vigentes detectadas por el radar del grupo para ESTA empresa
// (fiscal_ayudas + ayudas_perfiles, BD compartida; ref_ext = empresas.id).
// plazo_fin NULL = plazo por confirmar: se muestra igualmente, nunca se oculta.
export async function ayudasVigentes(empresaId: string): Promise<AyudaEmpresa[]> {
  try {
    return await prisma.$queryRaw<AyudaEmpresa[]>(Prisma.sql`
      SELECT a.id, a.titulo, a.organismo, a.cuantia_texto, a.encaje, a.url, a.plazo_fin
      FROM fiscal_ayudas a
      JOIN ayudas_perfiles p ON p.tenant = a.tenant AND p.activo
      WHERE p.ref_ext = ${empresaId}
        AND a.descartado = false
        AND (a.plazo_fin IS NULL OR a.plazo_fin >= CURRENT_DATE)
      ORDER BY a.plazo_fin ASC NULLS LAST
      LIMIT 3
    `)
  } catch {
    // Sin GRANT o sin las tablas del radar el dashboard no se cae: sin banner.
    return []
  }
}
