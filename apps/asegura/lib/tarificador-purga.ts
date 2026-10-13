// Purga de los DATOS PERSONALES del riesgo de un trabajo del tarificador al cerrarse (13/10/2026).
// La decisión es PURA (`planPurgaRiesgo` de @central/module-tarificacion, lista BLANCA por ramo); aquí solo se lee la
// fila y se escribe el riesgo recortado.
//
// 🚨 Se llama DENTRO de la misma transacción que cierra el trabajo y DESPUÉS de todo lo que lee el riesgo al cerrar
//    (guardar la tarificación, la evidencia, el aprendizaje de versión trabaja con la copia en memoria): mismo commit.
//    El UPDATE exige que el estado siga siendo el leído: si otro lo movió entre medias, no se toca.
// 🚨 Sin `import` de prisma en tiempo de ejecución (solo el TIPO): el cepo `tarificador-purga.test.ts` la prueba con
//    una BD falsa.
// Respaldo: el barrido (`barrerTarificadorRpa`) llama a `purgarRiesgosCerrados` por si algún camino se escapó.

import {
  CLAVES_RIESGO_COMUNIDAD,
  CLAVES_RIESGO_OTRO,
  CLAVES_RIESGO_VEHICULO,
  DIAS_ORIGEN_EMISION,
  ESTADOS_PURGA_RIESGO,
  SUBCLAVES_RIESGO,
  clavesEmision,
  origenEmisionLiberado,
  planPurgaRiesgo,
} from '@central/module-tarificacion'
import type { prisma } from './tenant'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
export type DbPurga = Pick<Tx, '$queryRaw' | '$executeRaw'>

type FilaPurga = {
  id: string; estado: string; modo: string | null; compania: string; ramo: string; riesgo: unknown
  terminado_at: Date | null; ahora: Date
  /** Estados de las EMISIONES que salieron de este trabajo (`trabajo_origen_id`); por `to_jsonb`: sin el SQL de emisión, []. */
  emisiones: string[] | null
  /** Si ESTE es un trabajo de emisión: su origen. */
  origen_id: string | null
}

/**
 * Recorta el riesgo de esos trabajos SI su estado actual lo pide. Si uno es una EMISIÓN ya cerrada, también se mira su
 * ORIGEN (que se libera cuando su emisión se cierra). Devuelve cuántos se escribieron.
 */
export async function purgarRiesgoTrabajos(db: DbPurga, ids: readonly (string | null | undefined)[], conOrigen = true): Promise<number> {
  const unicos = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x !== ''))]
  if (!unicos.length) return 0
  const filas = await db.$queryRaw<FilaPurga[]>`
    select t.id::text as id, t.estado, to_jsonb(t)->>'modo' as modo, t.compania, t.ramo, t.riesgo, t.terminado_at, now() as ahora,
           (select array_agg(e.estado) from seguros.tarificacion_trabajos e
            where e.correduria_id = t.correduria_id and to_jsonb(e)->>'modo' = 'emision'
              and to_jsonb(e)->>'trabajo_origen_id' = t.id::text) as emisiones,
           to_jsonb(t)->>'trabajo_origen_id' as origen_id
    from seguros.tarificacion_trabajos t
    where t.id = any(${unicos}::uuid[])`
  let n = 0
  const origenes: string[] = []
  for (const f of filas) {
    const origenLiberado = origenEmisionLiberado({ terminadoAt: f.terminado_at, ahora: f.ahora, emisiones: f.emisiones ?? [] })
    const plan = planPurgaRiesgo({ ...f, origenLiberado })
    if (f.modo === 'emision' && f.origen_id && (ESTADOS_PURGA_RIESGO as readonly string[]).includes(f.estado)) origenes.push(f.origen_id)
    if (!plan.purgar) continue
    n += await db.$executeRaw`
      update seguros.tarificacion_trabajos set riesgo = ${JSON.stringify(plan.riesgo)}::jsonb
      where id = ${f.id}::uuid and estado = ${f.estado}`
  }
  // El origen se mira UNA vez (un origen es de tarificar: no tiene a su vez origen).
  if (conOrigen && origenes.length) n += await purgarRiesgoTrabajos(db, origenes, false)
  return n
}

/**
 * RESPALDO del barrido: trabajos YA cerrados de la correduría cuyo riesgo aún tiene alguna clave fuera de la lista
 * blanca (también dentro de dirección/vehículo/elecciones). Excluye el origen de emisión (Allianz Comunidades `ok`) aún
 * NO liberado (misma regla que `origenEmisionLiberado`): sin eso volvería a salir en cada pasada y taparía a los demás.
 * Por tandas (`limite`).
 */
export async function purgarRiesgosCerrados(db: DbPurga, correduriaId: string, limite = 200): Promise<number> {
  const sub = (k: string) => [...(SUBCLAVES_RIESGO[k] ?? [])]
  const ids = await db.$queryRaw<{ id: string }[]>`
    select t.id::text as id
    from seguros.tarificacion_trabajos t
    where t.correduria_id = ${correduriaId}::uuid
      and t.estado = any(${[...ESTADOS_PURGA_RIESGO]}::text[])
      and not (t.estado = 'ok' and coalesce(to_jsonb(t)->>'modo', 'tarificar') = 'tarificar'
               and (t.compania || '::' || t.ramo) = any(${clavesEmision()}::text[])
               -- origen NO liberado: alguna emisión suya abierta, o ninguna cerrada y aún dentro del plazo
               and (exists (select 1 from seguros.tarificacion_trabajos e
                            where e.correduria_id = t.correduria_id and to_jsonb(e)->>'modo' = 'emision'
                              and to_jsonb(e)->>'trabajo_origen_id' = t.id::text and e.estado <> all(${[...ESTADOS_PURGA_RIESGO]}::text[]))
                    or (not exists (select 1 from seguros.tarificacion_trabajos e
                                    where e.correduria_id = t.correduria_id and to_jsonb(e)->>'modo' = 'emision'
                                      and to_jsonb(e)->>'trabajo_origen_id' = t.id::text)
                        and (t.terminado_at is null or t.terminado_at > now() - ${DIAS_ORIGEN_EMISION}::int * interval '1 day'))))
      and (
        exists (select 1 from jsonb_object_keys(t.riesgo) k
                where k <> all(case when t.ramo = 'comunidades' then ${[...CLAVES_RIESGO_COMUNIDAD]}::text[]
                                    when t.ramo in ('moto', 'auto') then ${[...CLAVES_RIESGO_VEHICULO]}::text[]
                                    else ${[...CLAVES_RIESGO_OTRO]}::text[] end))
        or (jsonb_typeof(t.riesgo->'direccion') = 'object'
            and exists (select 1 from jsonb_object_keys(t.riesgo->'direccion') k where k <> all(${sub('direccion')}::text[])))
        or (jsonb_typeof(t.riesgo->'seleccionVehiculo') = 'object'
            and exists (select 1 from jsonb_object_keys(t.riesgo->'seleccionVehiculo') k where k <> all(${sub('seleccionVehiculo')}::text[])))
        or (jsonb_typeof(t.riesgo->'eleccionVersion') = 'object'
            and exists (select 1 from jsonb_object_keys(t.riesgo->'eleccionVersion') k where k <> all(${sub('eleccionVersion')}::text[])))
        or (jsonb_typeof(t.riesgo->'eleccionVersionIa') = 'object'
            and exists (select 1 from jsonb_object_keys(t.riesgo->'eleccionVersionIa') k where k <> all(${sub('eleccionVersionIa')}::text[])))
      )
    order by t.updated_at desc
    limit ${limite}::int`
  return purgarRiesgoTrabajos(db, ids.map((f) => f.id))
}
