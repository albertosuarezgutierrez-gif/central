import { TIPO_OPOSICION_SENALES, oposicionVigente } from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import { getIdentidad } from '@/lib/session'

/**
 * Oposición VIGENTE a la revisión de los seguros de los inmuebles (`oposicion_senales_patrimonio`, P15 publicado,
 * 26/10/2026): `true` = se ha opuesto · `false` = se opuso y lo retiró · `null` = nunca se ha opuesto.
 * Filtra por `identidadId`, que tiene que ser el de la sesión (nunca un id de la request): otro id → `null` sin consultar.
 */
export async function oposicionSenalesVigente(identidadId: string): Promise<boolean | null> {
  if ((await getIdentidad())?.id !== identidadId) return null
  const filas = await prisma.portalConsentimiento.findMany({
    where: { identidadId, tipo: TIPO_OPOSICION_SENALES },
    select: { tipo: true, otorgado: true, versionTexto: true, creadoEn: true },
  })
  return oposicionVigente(filas)
}
