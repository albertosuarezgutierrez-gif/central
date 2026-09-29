// La llamada de seguimiento en «Hoy» (28/09/2026). Vive FUERA de presupuesto-seguimiento-servicio.ts a
// propósito: ese fichero tiene prohibido cualquier `catch` (un fallo de LECTURA tiene que lanzar), y esto
// es una ESCRITURA best-effort que no puede deshacer el «avisado».

import { prismaAsegura } from './asegura-db'
import { ESTADOS_ABIERTA } from './codeoscopic/oportunidad-presupuesto-reglas'
import type { Etapa } from './presupuesto-seguimiento'

/**
 * Además del Telegram, una LLAMADA para hoy en «Hoy», colgada de la oportunidad abierta de ese cliente
 * y ramo (Alberto, 28/09/2026). Un aviso que se lee en el móvil y se olvida no es un seguimiento.
 * Best-effort: si no hay oportunidad abierta, o ya hay una llamada pendiente en ella, no se crea nada;
 * y un fallo aquí no deshace el «avisado» (el Telegram ya salió).
 */
export async function tareaDeSeguimiento(correduriaId: string, presupuestoId: string, etapa: Etapa): Promise<void> {
  const db = prismaAsegura()
  const observaciones = etapa === 'sin_abrir'
    ? 'Llamar: no ha abierto el presupuesto en 48 h'
    : 'Llamar: abrió el presupuesto y no ha elegido en 72 h'
  try {
    await db.$executeRaw`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
      select p.correduria_id, 'llamada', 'alta', 'pendiente', ${observaciones},
             ((now() at time zone 'Europe/Madrid')::date + time '23:59:59') at time zone 'Europe/Madrid',
             p.cliente_id, o.id, 'central:seguimiento-presupuesto'
      from presupuesto p
      join oportunidades o on o.correduria_id = p.correduria_id and o.cliente_id = p.cliente_id
                          and o.tipo::text = p.ramo and o.estado::text = any(${[...ESTADOS_ABIERTA]}::text[])
      where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid
        and not exists (
          select 1 from gestiones g
          where g.oportunidad_id = o.id and g.estado::text = 'pendiente' and g.tipo::text = 'llamada'
        )
      order by o.created_at
      limit 1`
  } catch (err) {
    console.error('[seguimiento-presupuestos] no se pudo crear la llamada de seguimiento', presupuestoId, err instanceof Error ? err.message : err)
  }
}
