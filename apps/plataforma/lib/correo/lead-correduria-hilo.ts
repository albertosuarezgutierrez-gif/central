// lib/correo/lead-correduria-hilo.ts — ¿este correo es la respuesta de un lead en su propio hilo?
//
// Aparte de `lead-correduria-proceso.ts` para que el clasificador lo use sin importar el proceso (que a
// su vez importa `llamarIA` del clasificador: el ciclo funcionaría, pero no hace falta tenerlo).
// Un hilo = un lead: sus referencias (In-Reply-To/References) casan con un Message-ID que el triaje ya
// registró como `correduria-lead` en `correo_triaje`. Un fallo de BD = «no casa» (el correo sigue el
// camino normal y nunca se le da por respuesta de un lead sin haberlo visto).
import { prisma } from '@/lib/db'
import { esRespuestaDeLead } from './lead-correduria'

export async function esRespuestaDeLeadBD(referencias: string[] | undefined): Promise<boolean> {
  if (!referencias?.length) return false
  try {
    const filas = await prisma.$queryRaw<{ gmail_message_id: string }[]>`
      SELECT gmail_message_id FROM correo_triaje
      WHERE categoria = 'correduria-lead' AND gmail_message_id = ANY(${referencias.slice(0, 50)}::text[])
    `
    return esRespuestaDeLead(referencias, new Set(filas.map((f) => f.gmail_message_id)))
  } catch {
    return false
  }
}
