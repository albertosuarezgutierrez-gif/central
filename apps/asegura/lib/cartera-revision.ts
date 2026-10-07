// Bandeja de revisión manual (03/10/2026): lectura de los casos abiertos y registro de la decisión.
// Los casos viven en `seguros.operational_events` (sin tabla nueva); la forma está en `revision-manual.ts`.
// Sin PII: de cada póliza solo número, compañía, estado, fechas y nº de recibos/siniestros.
// «Son la misma» NO fusiona: solo guarda la decisión.

import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { EVENTO_ABRIR, EVENTO_RESOLVER, leerPayloadCaso, payloadResolucion, type ResolverEntrada } from './revision-manual'

export type PolizaRevision = {
  id: string
  numeroPoliza: string | null
  aseguradora: string
  dgs: string | null
  estado: string
  fechaInicio: string | null
  fechaVencimiento: string | null
  recibos: number
  siniestros: number
}

export type CasoRevision = {
  casoId: string
  numero: string
  motivo: string
  abiertoAt: string
  polizas: PolizaRevision[]
  /** Ids del caso que no se encontraron en la cartera (≠ «no existen»: pueden estar fusionadas o borradas). */
  polizasNoLeidas: number
}

const TOPE_CASOS = 500

/** `null` = no se pudo leer (no es «no hay ninguno»). */
export async function casosAbiertos(correduriaId: string): Promise<CasoRevision[] | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  try {
    const eventos = await db.$queryRaw<{ id: string; payload: unknown; ocurrio: string }[]>`
      select e.id::text as id, e.payload, to_char(e.occurred_at, 'YYYY-MM-DD') as ocurrio
      from operational_events e
      where e.event_name = ${EVENTO_ABRIR}
        and (e.correduria_id = ${correduriaId}::uuid or e.correduria_id is null)
        and not exists (
          select 1 from operational_events r
          where r.event_name = ${EVENTO_RESOLVER} and r.payload->>'caso_id' = e.id::text)
      order by e.occurred_at asc, e.id
      limit ${TOPE_CASOS}`
    const casos = eventos.flatMap((e) => {
      const p = leerPayloadCaso(e.payload)
      return p ? [{ e, p }] : []
    })
    const ids = [...new Set(casos.flatMap((c) => c.p.polizaIds))]
    const polizas = ids.length === 0 ? [] : await db.$queryRaw<{
      id: string; numero: string | null; aseguradora: string; dgs: string | null; estado: string
      inicio: string | null; vence: string | null; recibos: number; siniestros: number
    }[]>`
      select p.id::text as id, p.numero_poliza as numero, p.aseguradora, nullif(btrim(p.codigo_entidad_dgs), '') as dgs,
             p.estado::text as estado,
             to_char(p.fecha_inicio, 'YYYY-MM-DD') as inicio, to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vence,
             (select count(*) from poliza_recibos r where r.poliza_id = p.id)::int as recibos,
             (select count(*) from siniestros s where s.poliza_id = p.id)::int as siniestros
      from polizas p
      where p.correduria_id = ${correduriaId}::uuid and p.id = any(${ids}::uuid[])`
    const porId = new Map(polizas.map((x) => [x.id.toLowerCase(), x]))
    return casos.map(({ e, p }) => {
      const leidas = p.polizaIds.flatMap((id) => {
        const x = porId.get(id.toLowerCase())
        return x
          ? [{ id: x.id, numeroPoliza: x.numero, aseguradora: x.aseguradora, dgs: x.dgs, estado: x.estado,
               fechaInicio: x.inicio, fechaVencimiento: x.vence, recibos: x.recibos, siniestros: x.siniestros }]
          : []
      })
      return { casoId: e.id, numero: p.numero, motivo: p.motivo, abiertoAt: e.ocurrio, polizas: leidas, polizasNoLeidas: p.polizaIds.length - leidas.length }
    })
  } catch {
    return null
  }
}

export type ResultadoResolver =
  | { ok: true }
  | { ok: false; estado: 'no_existe' | 'ya_resuelto' | 'error'; status: 404 | 409 | 500 }

/** Registra la decisión. Idempotente: `(event_name, source_event_id)` es único y `source_event_id` = id del caso. */
export async function resolverCaso(correduriaId: string, d: ResolverEntrada): Promise<ResultadoResolver> {
  if (!aseguraConfigurada()) return { ok: false, estado: 'error', status: 500 }
  const db = prismaAsegura()
  try {
    const existe = await db.$queryRaw<{ id: string }[]>`
      select e.id::text as id from operational_events e
      where e.id = ${d.casoId}::uuid and e.event_name = ${EVENTO_ABRIR}
        and (e.correduria_id = ${correduriaId}::uuid or e.correduria_id is null)`
    if (existe.length === 0) return { ok: false, estado: 'no_existe', status: 404 }
    const n = await db.$executeRaw`
      insert into operational_events (event_name, source, source_event_id, correduria_id, state_to, payload)
      values (${EVENTO_RESOLVER}, 'revision-manual', ${d.casoId}, ${correduriaId}::uuid, ${d.decision},
              ${JSON.stringify(payloadResolucion(d))}::jsonb)
      on conflict (event_name, source_event_id) do nothing`
    return n === 0 ? { ok: false, estado: 'ya_resuelto', status: 409 } : { ok: true }
  } catch {
    return { ok: false, estado: 'error', status: 500 }
  }
}
