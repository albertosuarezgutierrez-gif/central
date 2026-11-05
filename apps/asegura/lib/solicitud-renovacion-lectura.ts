// SOLICITUD DE DATOS DE LA RENOVACIÓN (05/11/2026): la lectura LIGERA para el cron de avisos (`avisos-intranet.ts`), en fichero
// aparte para que el cron no cargue el Catastro, Telegram ni el tarificador de `solicitud-renovacion.ts`. Solo LEE.
// 🛡️ Por `correduria_id`. Sin la migración 2026-11-05d no puede haber ninguna publicada: `[]`. Otro fallo LANZA.
import { MOTIVO_SOLICITUD_RENOVACION } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { esColumnaAusente } from './pg-error'

/** Las publicadas (✅ de Alberto), pendientes y vivas. `clienteId` = el tomador. */
export async function solicitudesPublicadasPendientes(correduriaId: string): Promise<{ id: string; clienteId: string; polizaId: string | null }[]> {
  try {
    return await prismaAsegura().$queryRaw<{ id: string; clienteId: string; polizaId: string | null }[]>`
      select id::text as id, cliente_id::text as "clienteId", poliza_id::text as "polizaId" from solicitud_datos
      where correduria_id = ${correduriaId}::uuid and motivo = ${MOTIVO_SOLICITUD_RENOVACION} and publicada_at is not null
        and estado = 'pendiente' and caduca_at > now()`
  } catch (e) {
    if (esColumnaAusente(e)) return []
    throw e
  }
}
