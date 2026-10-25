import { TIPO_COMERCIAL_PATRIMONIO, VERSION_TEXTO_COMERCIAL_PATRIMONIO, consentimientoVigente } from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import { getIdentidad } from '@/lib/session'

/**
 * Estado VIGENTE de `comercial_patrimonio` de esta identidad (última fila sobre la versión actual del texto).
 * `null` = nunca se le ha preguntado, o su última fila es de otra versión del texto: la casilla se enseña DESMARCADA.
 * Filtra por `identidadId` (la identidad sale siempre de la cookie, nunca del cuerpo).
 */
export async function consentimientoPatrimonioVigente(identidadId: string): Promise<boolean | null> {
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId` (nunca un id de la request).
  if ((await getIdentidad())?.id !== identidadId) return null
  const filas = await prisma.portalConsentimiento.findMany({
    where: { identidadId, tipo: TIPO_COMERCIAL_PATRIMONIO },
    select: { tipo: true, otorgado: true, versionTexto: true, creadoEn: true },
  })
  return consentimientoVigente(filas, TIPO_COMERCIAL_PATRIMONIO, VERSION_TEXTO_COMERCIAL_PATRIMONIO)
}
