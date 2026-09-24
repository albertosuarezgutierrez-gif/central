// La mitad con BD del radar de recibos (20/09/2026): qué remitentes han
// producido alguna vez un correo `correduria-recibo`. Impuro (Prisma), por
// eso vive aparte de `radar-recibos.ts`, que es puro y se testea a secas.
import { prisma } from '@/lib/db'

/**
 * Todos los remitentes (direcciones, no nombres) de correos ya clasificados
 * `correduria-recibo`, alguna vez, sin límite de fecha: la pregunta es «¿ha
 * pasado ALGUNA VEZ?», no «¿ha pasado esta semana?» — una compañía que avisó
 * una vez hace meses sigue siendo una compañía con canal.
 *
 * `null` = no se ha podido consultar (nunca se colapsa a `[]`, que se leería
 * como «ninguna compañía ha avisado nunca»).
 */
export async function remitentesConRecibo(): Promise<string[] | null> {
  try {
    const filas = await prisma.$queryRaw<{ remitente: string }[]>`
      SELECT DISTINCT remitente FROM correo_triaje WHERE categoria = 'correduria-recibo'
    `
    return filas.map((f) => f.remitente)
  } catch {
    return null
  }
}
