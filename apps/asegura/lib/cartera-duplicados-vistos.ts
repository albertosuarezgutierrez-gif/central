// Duplicados vivos ya avisados (ver `duplicados-vistos.ts`). `null` = no se pudo leer / nunca se guardó:
// el cron lo trata como «todo es nuevo» (perder un aviso es peor que repetirlo).

import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { EVENTO_DUPLICADOS_VISTO, leerClavesVistas } from './duplicados-vistos'

export type LecturaVistos = { estado: 'ok'; claves: string[] | null } | { estado: 'error' }

/** `claves: null` = nunca se ha guardado ninguno. Un fallo de lectura es `error`, no «ninguno». */
export async function duplicadosVistos(correduriaId: string): Promise<LecturaVistos> {
  if (!aseguraConfigurada()) return { estado: 'error' }
  try {
    const f = await prismaAsegura().$queryRaw<{ payload: unknown }[]>`
      select e.payload from operational_events e
      where e.event_name = ${EVENTO_DUPLICADOS_VISTO} and e.correduria_id = ${correduriaId}::uuid
      order by e.occurred_at desc limit 1`
    if (f.length === 0) return { estado: 'ok', claves: null }
    const claves = leerClavesVistas(f[0].payload)
    return claves === null ? { estado: 'error' } : { estado: 'ok', claves }
  } catch {
    return { estado: 'error' }
  }
}

/** `false` = no se pudo guardar. */
export async function guardarDuplicadosVistos(correduriaId: string, claves: string[]): Promise<boolean> {
  if (!aseguraConfigurada()) return false
  try {
    await prismaAsegura().$executeRaw`
      insert into operational_events (event_name, source, correduria_id, occurred_at, payload)
      values (${EVENTO_DUPLICADOS_VISTO}, 'cron-duplicados', ${correduriaId}::uuid, now(),
              ${JSON.stringify({ claves })}::jsonb)`
    return true
  } catch {
    return false
  }
}
