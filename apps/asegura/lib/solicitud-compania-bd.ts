// apps/asegura/lib/solicitud-compania-bd.ts
//
// Seguimiento de una SOLICITUD en la compañía de principio a fin (F1 del agente de correo, 21/10/2026, spec §4.1).
// Una fila por (correduría, compañía DGS, nº de solicitud) en `seguros.solicitud_compania`; cada correo es un hito
// (`correo_evento_entrante.solicitud_id`). Lo escribe el despacho del evento `solicitud` (`correo-evento-bd.ts`), con
// la oportunidad si casa y SIN ella si no (la solicitud existe igual: es lo que dice la compañía).
//
// Reglas:
// - Un correo MÁS VIEJO que el último estado aplicado no pisa el estado (como `compania_solicitud_at`).
// - El nº de póliza emitida es informativo: la póliza la trae CIMA y se enlaza sola (`enlazarPolizasConOportunidades`).
// - Best-effort: sin la migración F1 (o si falla) el despacho sigue exactamente como antes; esto nunca lo tumba.
//
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.

import { estadoCierraSolicitud, estadoSolicitudNormalizado, sinDatosSensibles } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { esTablaInexistente } from './correo-avisos-intranet'
import { esColumnaAusente } from './pg-error'
import type { ItemEvento } from './correo-evento'

type Db = ReturnType<typeof prismaAsegura>
type ItemSolicitud = Extract<ItemEvento, { tipo: 'solicitud' }>

/**
 * Apunta el hito en `solicitud_compania` y engancha la fila del correo. Devuelve el id de la solicitud, o `null` si no
 * se pudo (sin migración o error: se registra y se sigue).
 */
export async function anotarSolicitudCompania(
  db: Db, correduriaId: string, compania: string, codigoDgs: string, item: ItemSolicitud,
  oportunidadId: string | null, instante: Date | null, filaEventoId: string,
): Promise<string | null> {
  const estado = estadoSolicitudNormalizado(item.fase ?? null, item.estado)
  const literal = item.estado ? sinDatosSensibles(item.estado).slice(0, 200) : null
  const cuando = instante ?? new Date()
  const cierra = estadoCierraSolicitud(estado)
  const numeroPoliza = item.fase === 'emitida' ? item.numeroPoliza ?? null : null
  try {
    const [s] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into solicitud_compania (correduria_id, compania, codigo_entidad_dgs, numero_solicitud, numero_poliza, oportunidad_id,
                                      ramo, estado, estado_compania, estado_at, cerrada_at)
      values (${correduriaId}::uuid, ${compania}, ${codigoDgs}, ${item.numeroSolicitud}, ${numeroPoliza}, ${oportunidadId}::uuid,
              ${item.ramo}, ${estado}, ${literal}, ${cuando}, ${cierra ? cuando : null})
      on conflict (correduria_id, codigo_entidad_dgs, numero_solicitud) do update set
        numero_poliza   = coalesce(excluded.numero_poliza, solicitud_compania.numero_poliza),
        oportunidad_id  = coalesce(excluded.oportunidad_id, solicitud_compania.oportunidad_id),
        ramo            = coalesce(solicitud_compania.ramo, excluded.ramo),
        estado          = case when solicitud_compania.estado_at is null or excluded.estado_at >= solicitud_compania.estado_at
                               then coalesce(excluded.estado, solicitud_compania.estado) else solicitud_compania.estado end,
        estado_compania = case when solicitud_compania.estado_at is null or excluded.estado_at >= solicitud_compania.estado_at
                               then coalesce(excluded.estado_compania, solicitud_compania.estado_compania) else solicitud_compania.estado_compania end,
        cerrada_at      = case when (solicitud_compania.estado_at is null or excluded.estado_at >= solicitud_compania.estado_at)
                               then coalesce(excluded.cerrada_at, case when excluded.estado is null then solicitud_compania.cerrada_at end)
                               else solicitud_compania.cerrada_at end,
        estado_at       = greatest(solicitud_compania.estado_at, excluded.estado_at),
        updated_at      = now()
      returning id::text as id`)
    if (!s) return null
    await db.$executeRaw(Prisma.sql`
      update correo_evento_entrante set solicitud_id = ${s.id}::uuid
      where id = ${filaEventoId}::uuid and correduria_id = ${correduriaId}::uuid`)
    return s.id
  } catch (e) {
    if (!esTablaInexistente(e) && !esColumnaAusente(e)) console.error('[solicitud-compania] hito no anotado:', e instanceof Error ? e.message.slice(0, 200) : e)
    return null
  }
}

export type HitoSolicitud = { id: string; creado: string; tipo: string; estado: string; resumen: string | null; motivo: string | null }

export type HistorialSolicitud = {
  solicitud: {
    id: string; compania: string; numeroSolicitud: string; numeroPoliza: string | null; estado: string | null; estadoCompania: string | null
    estadoAt: string | null; cerradaAt: string | null; oportunidadId: string | null; polizaId: string | null
  } | null
  hitos: HitoSolicitud[]
}

/**
 * El historial de una solicitud: la fila de `solicitud_compania` y TODOS los correos que hablan de ella (por su
 * `solicitud_id`, por su nº, y los de su póliza emitida). `solicitud: null` con hitos = aún no se había anotado (antes del
 * SQL F1). Lanza si falla la lectura: quien llama lo dice, nunca «no hay historial».
 */
export async function historialSolicitud(
  correduriaId: string, q: { compania: string; numero: string } | { eventoId: string },
): Promise<HistorialSolicitud | 'sin_migracion'> {
  const db = prismaAsegura()
  let ancla: { compania: string; numero: string }
  if ('eventoId' in q) {
    const [e] = await db.$queryRaw<{ compania: string; clave: string; tipo: string }[]>(Prisma.sql`
      select compania, clave, tipo from correo_evento_entrante where id = ${q.eventoId}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!e || e.tipo !== 'solicitud') return { solicitud: null, hitos: [] }
    ancla = { compania: e.compania, numero: e.clave }
  } else ancla = q
  let solicitud: HistorialSolicitud['solicitud'] = null
  try {
    const [s] = await db.$queryRaw<NonNullable<HistorialSolicitud['solicitud']>[]>(Prisma.sql`
      select id::text as id, compania, numero_solicitud as "numeroSolicitud", numero_poliza as "numeroPoliza", estado,
             estado_compania as "estadoCompania", to_char(estado_at at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI') as "estadoAt",
             to_char(cerrada_at at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI') as "cerradaAt",
             oportunidad_id::text as "oportunidadId", poliza_id::text as "polizaId"
      from solicitud_compania
      where correduria_id = ${correduriaId}::uuid and compania = ${ancla.compania} and numero_solicitud = ${ancla.numero}`)
    solicitud = s ?? null
  } catch (e) {
    if (esTablaInexistente(e)) return 'sin_migracion'
    throw e
  }
  const hitos = await db.$queryRaw<HitoSolicitud[]>(Prisma.sql`
    select e.id::text as id, to_char(e.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI') as creado,
           e.tipo, e.estado, e.resumen, e.motivo
    from correo_evento_entrante e
    where e.correduria_id = ${correduriaId}::uuid
      and ((e.tipo = 'solicitud' and e.compania = ${ancla.compania} and e.clave = ${ancla.numero})
           or (${solicitud?.id ?? null}::uuid is not null and e.solicitud_id = ${solicitud?.id ?? null}::uuid)
           or (${solicitud?.numeroPoliza ?? null}::text is not null and e.compania = ${ancla.compania}
               and ltrim(upper(regexp_replace(coalesce(e.numero_poliza, ''), '[^A-Za-z0-9]', '', 'g')), '0')
                 = ltrim(upper(regexp_replace(coalesce(${solicitud?.numeroPoliza ?? null}::text, ''), '[^A-Za-z0-9]', '', 'g')), '0')))
    order by e.created_at asc
    limit 100`)
  return { solicitud, hitos }
}
