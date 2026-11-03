// Lectura de BD de la prima vie/sáb por ritmo propio (ver `pricing-ritmo-finde.ts`). UNA consulta
// para los dos que la usan: `pricing/apply` (la aplica) y `pricing/canal` (no acusa de «caro» un
// finde subido por la prima). Si cada ruta tuviera su SQL, el centinela juzgaría con otra prima.
//
// Si cualquiera de las dos lecturas falla, REVIENTA (el llamador declara la lectura caída y no hay
// prima): sin las canceladas el ritmo saldría inflado, y eso no se degrada en silencio.

import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { ritmoFindePorPiso, type RitmoFinde } from "@/lib/sivra/pricing-ritmo-finde"

/** `hoy` = 'YYYY-MM-DD' inyectado (el mismo «hoy» del motor). */
export async function leerRitmoFinde(hoy: string): Promise<Map<string, RitmoFinde>> {
  // Misma fuente y mismo `historico_desde` que la antelación; sin bloqueos a 0 €.
  // OJO: SQL dentro de un template literal de TS — aqui NO se pueden usar backticks ni $ { }.
  const [reservas, canceladas] = await Promise.all([
    prisma.$queryRaw<{ pid: string; ci: string; nights: number; rv: string | null }[]>(Prisma.sql`
      SELECT i."propertyId" AS pid, i."checkIn"::date::text AS ci, i.nights::int AS nights,
             i.reserved_at::date::text AS rv
      FROM incomes i
      LEFT JOIN pricing_settings ps ON ps.property_id = i."propertyId"
      WHERE i.nights > 0 AND i.amount_gross > 0
        AND i."checkIn" >= CURRENT_DATE - 400 AND i."checkIn" <= CURRENT_DATE + 400
        AND (ps.historico_desde IS NULL OR i."checkIn"::date >= ps.historico_desde)
    `),
    // Canceladas PASADAS que llegaron a estar en `incomes` (las «hechas y deshechas entre dos
    // pasadas» nunca estuvieron en libro para nosotros: tampoco las tendría el futuro).
    prisma.$queryRaw<{ pid: string; ci: string; nights: number; rv: string | null; vista: string | null }[]>(Prisma.sql`
      SELECT c.property_id AS pid, c.check_in::date::text AS ci, c.nights::int AS nights,
             c.reserved_at::date::text AS rv, c.cancelacion_vista_at::date::text AS vista
      FROM reservas_canceladas c
      LEFT JOIN pricing_settings ps ON ps.property_id = c.property_id
      WHERE c.estaba_en_incomes AND c.property_id IS NOT NULL AND c.nights > 0
        AND (c.amount_gross IS NULL OR c.amount_gross > 0)
        AND c.check_in >= CURRENT_DATE - 400 AND c.check_in < CURRENT_DATE
        AND (ps.historico_desde IS NULL OR c.check_in::date >= ps.historico_desde)
    `),
  ])
  return ritmoFindePorPiso(reservas, canceladas, hoy)
}
