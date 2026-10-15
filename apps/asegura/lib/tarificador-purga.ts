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
import { DIAS_RETENCION_EVIDENCIA, ESTADOS_PURGA_EVIDENCIA, idsEvidenciaAPurgar } from './tarificador-purga-evidencia-reglas.ts'

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
    // El inventario de pantalla (jsonb «error») cae con el riesgo: se sanea SIN los valores del riesgo y puede llevar nombres.
    // El recorrido se CONSERVA (15/10/2026): solo él se re-sanea con los valores del riesgo antes de guardarse y es el
    // diagnóstico de un `error_definitivo` (el trabajo 50cc150d quedó sin él). Caduca a los `DIAS_RETENCION_RECORRIDO`
    // en el barrido (`purgarRecorridosCaducados`).
    n += await db.$executeRaw`
      update seguros.tarificacion_trabajos set riesgo = ${JSON.stringify(plan.riesgo)}::jsonb,
        error = case when jsonb_typeof(error) = 'object' then error - 'inventarioDom' else error end
      where id = ${f.id}::uuid and estado = ${f.estado}`
  }
  // El origen se mira UNA vez (un origen es de tarificar: no tiene a su vez origen).
  if (conOrigen && origenes.length) n += await purgarRiesgoTrabajos(db, origenes, false)
  return n
}

/** Días que un trabajo CERRADO conserva `error.recorrido` (diagnóstico del fallo). */
export const DIAS_RETENCION_RECORRIDO = 30

/**
 * Barrido: quita `recorrido` (y `inventarioDom`, por si quedara alguno) del jsonb `error` de los trabajos cerrados hace más de `dias` (por tandas).
 * Un trabajo abierto (`atascado`, `error_reintentable`, `requiere_humano`…) los conserva siempre. Devuelve cuántos tocó.
 */
export async function purgarRecorridosCaducados(db: DbPurga, correduriaId: string, dias = DIAS_RETENCION_RECORRIDO, limite = 500): Promise<number> {
  return db.$executeRaw`
    update seguros.tarificacion_trabajos t
       set error = t.error - 'recorrido' - 'inventarioDom'
     where t.id in (
       select x.id from seguros.tarificacion_trabajos x
        where x.correduria_id = ${correduriaId}::uuid
          and x.estado = any(${[...ESTADOS_PURGA_RIESGO]}::text[])
          and x.terminado_at < now() - ${dias}::int * interval '1 day'
          and jsonb_typeof(x.error) = 'object' and (x.error->'recorrido' is not null or x.error->'inventarioDom' is not null)
        limit ${limite}::int)`
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
      -- Un riesgo que no es objeto no se toca (ni se lee con jsonb_object_keys).
      and jsonb_typeof(t.riesgo) = 'object'
      and not (t.estado = 'ok' and coalesce(to_jsonb(t)->>'modo', 'tarificar') = 'tarificar'
               and (t.compania || '::' || t.ramo) = any(${clavesEmision()}::text[])
               -- origen NO liberado (= origenEmisionLiberado falso): alguna emisión suya abierta, o ninguna emitido
               -- y aún dentro del plazo desde su ok (una rechazada/caducada no libera: se puede volver a pedir).
               and (exists (select 1 from seguros.tarificacion_trabajos e
                            where e.correduria_id = t.correduria_id and to_jsonb(e)->>'modo' = 'emision'
                              and to_jsonb(e)->>'trabajo_origen_id' = t.id::text and e.estado <> all(${[...ESTADOS_PURGA_RIESGO]}::text[]))
                    or (not exists (select 1 from seguros.tarificacion_trabajos e
                                    where e.correduria_id = t.correduria_id and to_jsonb(e)->>'modo' = 'emision'
                                      and to_jsonb(e)->>'trabajo_origen_id' = t.id::text and e.estado = 'emitido')
                        and (t.terminado_at is null or t.terminado_at > now() - ${DIAS_ORIGEN_EMISION}::int * interval '1 day'))))
      and (
        exists (select 1 from jsonb_object_keys(case when jsonb_typeof(t.riesgo) = 'object' then t.riesgo else '{}'::jsonb end) k
                where k <> all(case when t.ramo = 'comunidades' then ${[...CLAVES_RIESGO_COMUNIDAD]}::text[]
                                    when t.ramo in ('moto', 'auto') then ${[...CLAVES_RIESGO_VEHICULO]}::text[]
                                    else ${[...CLAVES_RIESGO_OTRO]}::text[] end))
        -- Sub-objetos: el CASE garantiza que jsonb_object_keys solo ve un objeto (el AND no fija el orden de evaluación).
        or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(t.riesgo->'direccion') = 'object' then t.riesgo->'direccion' else '{}'::jsonb end) k
                   where k <> all(${sub('direccion')}::text[]))
        or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(t.riesgo->'seleccionVehiculo') = 'object' then t.riesgo->'seleccionVehiculo' else '{}'::jsonb end) k
                   where k <> all(${sub('seleccionVehiculo')}::text[]))
        or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(t.riesgo->'eleccionVersion') = 'object' then t.riesgo->'eleccionVersion' else '{}'::jsonb end) k
                   where k <> all(${sub('eleccionVersion')}::text[]))
        or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(t.riesgo->'eleccionVersionIa') = 'object' then t.riesgo->'eleccionVersionIa' else '{}'::jsonb end) k
                   where k <> all(${sub('eleccionVersionIa')}::text[]))
        or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(t.riesgo->'vehiculoConfirmado') = 'object' then t.riesgo->'vehiculoConfirmado' else '{}'::jsonb end) k
                   where k <> all(${sub('vehiculoConfirmado')}::text[]))
      )
    order by t.updated_at desc
    limit ${limite}::int`
  return purgarRiesgoTrabajos(db, ids.map((f) => f.id))
}

/**
 * Purga de la EVIDENCIA de fallo (capturas/HTML en `seguros.documentos`) de trabajos terminados hace más de
 * `DIAS_RETENCION_EVIDENCIA` días: borra los documentos de fallo y anula las referencias (`evidencia_documento_id` por el
 * ON DELETE SET NULL, `error.html_documento_id`, `tarificacion_trabajo_pasos.captura_ref`). Idempotente (un trabajo ya
 * purgado no vuelve a salir), por tandas, y solo borra ficheros `fallo-*.png|html` del agente (nunca el PDF de una oferta).
 * Devuelve cuántos documentos borró.
 */
export async function purgarEvidenciaCaducada(db: DbPurga, correduriaId: string, dias = DIAS_RETENCION_EVIDENCIA, limite = 100): Promise<number> {
  const filas = await db.$queryRaw<{
    id: string; estado: string; terminado_at: Date | null; evidencia_id: string | null; evidencia_nombre: string | null
    html_id: string | null; capturas: (string | null)[] | null; ahora: Date
  }[]>`
    select t.id::text as id, t.estado, t.terminado_at, t.evidencia_documento_id::text as evidencia_id, d.nombre_fichero as evidencia_nombre,
           case when jsonb_typeof(t.error) = 'object' then t.error->>'html_documento_id' end as html_id,
           (select array_agg(p.captura_ref) from seguros.tarificacion_trabajo_pasos p where p.trabajo_id = t.id and p.captura_ref is not null) as capturas,
           now() as ahora
    from seguros.tarificacion_trabajos t
    left join seguros.documentos d on d.id = t.evidencia_documento_id
    where t.correduria_id = ${correduriaId}::uuid
      and t.estado = any(${[...ESTADOS_PURGA_EVIDENCIA]}::text[])
      and t.terminado_at < now() - ${dias}::int * interval '1 day'
      -- Solo trabajos con algo PURGABLE de verdad (documento de fallo del agente, de esta correduría) o con una referencia
      -- colgando a un documento ya borrado (restos de una pasada a medias). Sin esto, uno con referencias a documentos
      -- no purgables saldría en cada pasada y copaba el lote.
      and (exists (select 1 from seguros.documentos x
                   where x.correduria_id = t.correduria_id and x.subido_por = 'agente' and x.nombre_fichero ~ '^fallo-[0-9a-f]{8}\\.(png|html)$'
                     and (x.id = t.evidencia_documento_id
                          or (jsonb_typeof(t.error) = 'object' and x.id::text = t.error->>'html_documento_id')
                          or exists (select 1 from seguros.tarificacion_trabajo_pasos p where p.trabajo_id = t.id and p.captura_ref = 'documento:' || x.id::text)))
           or (jsonb_typeof(t.error) = 'object' and t.error->>'html_documento_id' ~ '^[0-9a-f-]{36}$'
               and not exists (select 1 from seguros.documentos x where x.id::text = t.error->>'html_documento_id'))
           or exists (select 1 from seguros.tarificacion_trabajo_pasos p
                      where p.trabajo_id = t.id and p.captura_ref ~ '^documento:[0-9a-f-]{36}$'
                        and not exists (select 1 from seguros.documentos x where 'documento:' || x.id::text = p.captura_ref)))
    order by t.terminado_at
    limit ${limite}::int`
  const trabajos: string[] = []
  const docs = new Set<string>()
  for (const f of filas) {
    const ids = idsEvidenciaAPurgar({ estado: f.estado, terminadoAt: f.terminado_at, evidenciaId: f.evidencia_id, evidenciaNombre: f.evidencia_nombre, htmlId: f.html_id, capturasRef: f.capturas ?? [] }, new Date(f.ahora), dias)
    trabajos.push(f.id)
    ids.forEach((i) => docs.add(i))
  }
  if (!trabajos.length) return 0
  // Primero se BORRA el documento y después se anulan las referencias: si el borrado falla, las referencias siguen en pie y la
  // siguiente pasada vuelve a seleccionar el trabajo; si fallan las anulaciones, quedan referencias colgando a un documento ya
  // borrado, que la siguiente pasada limpia (cada sentencia es idempotente). Al revés, un borrado fallido dejaría el documento
  // huérfano y sin referencia, y nunca más se seleccionaría.
  const borrados = docs.size
    ? await db.$queryRaw<{ id: string }[]>`
    delete from seguros.documentos
    where id = any(${[...docs]}::uuid[]) and correduria_id = ${correduriaId}::uuid
      and subido_por = 'agente' and nombre_fichero ~ '^fallo-[0-9a-f]{8}\\.(png|html)$'
    returning id::text as id`
    : []
  // Solo se anulan las referencias a documentos que YA NO existen (los que acabamos de borrar y los que quedaron colgando de
  // una pasada anterior): una referencia a un documento que sigue vivo (p. ej. el PDF de una oferta) no se toca.
  await db.$executeRaw`update seguros.tarificacion_trabajo_pasos p set captura_ref = null
    where p.trabajo_id = any(${trabajos}::uuid[]) and p.captura_ref ~ '^documento:[0-9a-f-]{36}$'
      and not exists (select 1 from seguros.documentos x where 'documento:' || x.id::text = p.captura_ref)`
  await db.$executeRaw`update seguros.tarificacion_trabajos t set error = t.error - 'html_documento_id'
    where t.id = any(${trabajos}::uuid[]) and jsonb_typeof(t.error) = 'object' and t.error->>'html_documento_id' ~ '^[0-9a-f-]{36}$'
      and not exists (select 1 from seguros.documentos x where x.id::text = t.error->>'html_documento_id')`
  return borrados.length
}
