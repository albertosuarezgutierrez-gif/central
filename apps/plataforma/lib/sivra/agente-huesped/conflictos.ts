// lib/sivra/agente-huesped/conflictos.ts — choques entre la guía de Smoobu y nuestras reglas.
//
// La guía del huésped y los overrides de negocio (parking, equipaje, llegada, horarios) pueden decir
// cosas distintas. La precedencia la resuelve `guest-app.ts` (gana la regla de negocio), pero
// resolverlo EN SILENCIO es como el caso del parking: la guía y el email de confirmación seguían
// hablando de un aparcamiento mientras el agente respondía otra cosa, y nadie se enteró en meses.
// Aquí se avisa UNA vez por piso+sección, para que la contradicción salga a la luz.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { escapeHtml, tgAviso } from '@/lib/telegram'
export async function avisarConflictoGuia(
  propertyId: string,
  property: string,
  secciones: string[],
): Promise<void> {
  for (const seccion of secciones || []) {
    if (!seccion) continue
    // El INSERT es el cerrojo: si la fila ya existía, `n` es 0 y no se vuelve a avisar.
    const n = await prisma.$executeRaw(Prisma.sql`
      INSERT INTO mensajes_conflictos_guia (property_id, seccion)
      VALUES (${propertyId}, ${seccion})
      ON CONFLICT (property_id, seccion) DO NOTHING
    `).catch(() => 0)
    if (!n) continue
    await tgAviso('huespedes.conflicto', 
      `⚠️ <b>La guía de Smoobu contradice una regla nuestra</b>` +
      `\n\nPiso: <b>${escapeHtml(property || propertyId)}</b>` +
      `\nSección de la guía: <b>${escapeHtml(seccion)}</b>` +
      `\n\nEl agente NO le está contando al huésped lo que dice esa sección: manda nuestra regla de negocio.` +
      `\nPero el huésped SÍ ve la guía en su enlace, así que las dos versiones conviven.` +
      `\n\n<i>Si la guía está desactualizada, edítala en Smoobu. Si la buena es la guía, hay que cambiar la regla en el código.</i>`,
    ).catch(() => {})
  }
}
