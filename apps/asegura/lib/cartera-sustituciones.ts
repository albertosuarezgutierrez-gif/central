// Seguimiento de sustituciones por retarificación (cambio de compañía).
//
// Cuando se emite una póliza que sustituye a otra (ver `lib/emision.ts`), la
// vieja se marca `sustituida_at` y la nueva guarda `poliza_origen_id`. Esto
// NO se da por hecho: hasta que CIMA confirme la nueva (`id_poliza_entidad`),
// no hay prueba de que el cliente la esté pagando de verdad. Esta lista es el
// «pendiente de comprobar», para que el seguimiento no dependa de acordarse
// de abrir la ficha — Alberto, 20/09/2026: «hay que hacerle seguimiento a que
// el cliente la pague y eso lo confirma CIMA».
//
// Solo entran las que llevan sustituidas ≥3 días: CIMA tarda en traer la
// confirmación (no es instantáneo) y meter aquí lo de esta misma mañana solo
// añadiría ruido a una lista que se supone que hay que trabajar.

import { aseguraConfigurada, prismaAsegura } from './asegura-db'

const DIAS_GRACIA = 3

export type SustitucionSeguimiento = {
  clienteId: string
  cliente: string
  diasSustituida: number
  sustituidaAt: string
  polizaVieja: { id: string; aseguradora: string; numeroPoliza: string | null }
  polizaNueva: { id: string; aseguradora: string; numeroPoliza: string | null } | null
}

/** `null` = no se pudo leer (no es «no hay ninguna pendiente»). */
export async function sustitucionesEnSeguimiento(correduriaId: string): Promise<SustitucionSeguimiento[] | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  try {
    const filas = await db.$queryRaw<
      {
        cliente_id: string
        cliente: string
        sustituida_at: Date
        dias: number
        vieja_id: string
        vieja_aseguradora: string
        vieja_numero: string | null
        nueva_id: string | null
        nueva_aseguradora: string | null
        nueva_numero: string | null
      }[]
    >`
      select
        c.id::text as cliente_id, (c.nombre || ' ' || c.apellidos) as cliente,
        v.sustituida_at, extract(day from now() - v.sustituida_at)::int as dias,
        v.id::text as vieja_id, v.aseguradora as vieja_aseguradora, v.numero_poliza as vieja_numero,
        n.id::text as nueva_id, n.aseguradora as nueva_aseguradora, n.numero_poliza as nueva_numero
      from polizas v
      join clientes c on c.id = v.cliente_id
      left join polizas n on n.poliza_origen_id = v.id
      where v.correduria_id = ${correduriaId}::uuid
        and v.sustituida_at is not null
        and v.sustituida_at <= now() - make_interval(days => ${DIAS_GRACIA}::int)
        and (n.id is null or n.id_poliza_entidad is null)
      order by v.sustituida_at asc
      limit 200`
    return filas.map((f) => ({
      clienteId: f.cliente_id,
      cliente: f.cliente,
      diasSustituida: f.dias,
      sustituidaAt: f.sustituida_at.toISOString().slice(0, 10),
      polizaVieja: { id: f.vieja_id, aseguradora: f.vieja_aseguradora, numeroPoliza: f.vieja_numero },
      polizaNueva: f.nueva_id
        ? { id: f.nueva_id, aseguradora: f.nueva_aseguradora ?? '', numeroPoliza: f.nueva_numero }
        : null,
    }))
  } catch {
    return null
  }
}
