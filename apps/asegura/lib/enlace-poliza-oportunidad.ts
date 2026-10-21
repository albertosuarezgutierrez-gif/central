// apps/asegura/lib/enlace-poliza-oportunidad.ts
//
// Enlace póliza CIMA NUEVA ↔ oportunidad ABIERTA (F1 del agente de correo, 21/10/2026, spec §4.1 + §4.8). Corre DENTRO
// de `detectarYGuardar` (tras cada pull de CIMA), en su PROPIO punto de guardado, después del cierre por matrícula
// (`ganarOportunidadesEmitidas`): lo que aquel ya cerró no se vuelve a mirar.
//
// La regla vive en `@central/module-seguros` (`decidirEnlacesPolizaOportunidad`, puro y con test):
//   1. nº de solicitud → nº de póliza emitida (lo dijo la compañía por correo; `solicitud_compania`): prueba;
//   2. si no, mismo tomador (misma ficha o mismo índice ciego del NIF) + misma compañía (DGS) + mismo ramo, UNO a UNO.
// Varias candidatas → NO se enlaza nada y se deja un aviso (`correo_cruce_aviso`, tipo `enlace_ambiguo`) que el cron
// de cruce manda por Telegram. Nunca por el nombre del tomador.
//
// El enlace es el mismo que el cierre por matrícula: la oportunidad pasa a `ganada` con `poliza_ganada_id`, sus tareas
// abiertas se cierran con una línea que dice por qué y queda en `oportunidad_historial` (actor `sistema:cartera`) y una
// nota en la ficha. Solo toca NUESTROS campos: CIMA no escribe oportunidades.

import {
  ORIGEN_RETENCION, POLIZA_ESTADOS_VIGENTES, decidirEnlacesPolizaOportunidad, dgsDeOportunidad, sqlCarteraViva,
  type OportunidadEnlace, type PolizaNuevaEnlace, type SolicitudEmitidaEnlace,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import type { prismaAsegura } from './asegura-db'
import { textoAvisoEnlaceAmbiguo } from './correo-cruce'

type Tx = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw' | '$executeRaw'>

export type ResultadoEnlaceOportunidades = { ganadas: { id: string; estado: string }[]; ambiguas: number; solicitudesConPoliza: number }

/** Ventana de pólizas «nuevas»: lo que entró por CIMA en los últimos 60 días. */
const VENTANA_DIAS = 60

/** Una consulta opcional (tabla de la migración F1) en su punto de guardado: si falla, no envenena la transacción. */
async function opcional<T>(tx: Tx, nombre: string, f: () => Promise<T>, siFalla: T): Promise<T> {
  await tx.$executeRaw(Prisma.raw(`savepoint ${nombre}`))
  try {
    const r = await f()
    await tx.$executeRaw(Prisma.raw(`release savepoint ${nombre}`))
    return r
  } catch {
    await tx.$executeRaw(Prisma.raw(`rollback to savepoint ${nombre}`))
    return siFalla
  }
}

export async function enlazarPolizasConOportunidades(tx: Tx, correduriaId: string): Promise<ResultadoEnlaceOportunidades> {
  const viva = Prisma.raw(sqlCarteraViva('p'))
  const vigentes = [...POLIZA_ESTADOS_VIGENTES] as string[]
  // Las columnas de «en la compañía» se leen por `to_jsonb`: sin el SQL 2026-10-20 salen NULL, no revientan.
  const ops = await tx.$queryRaw<{ id: string; clienteId: string; dniHash: string | null; ramo: string | null; companiaSolicitud: string | null; aseguradoraGanadora: string | null; creadaEn: Date; estado: string }[]>`
    select o.id::text as id, o.cliente_id::text as "clienteId", c.dni_lookup_hash as "dniHash", o.tipo::text as ramo,
           (to_jsonb(o.*)->>'compania_solicitud_compania') as "companiaSolicitud", o.aseguradora_ganadora as "aseguradoraGanadora",
           o.created_at as "creadaEn", o.estado::text as estado
    from oportunidades o
    join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
    where o.correduria_id = ${correduriaId}::uuid and o.cliente_id is not null
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and o.import_ref is null -- import_ref de OPORTUNIDAD (lead del volcado), no de póliza
      and o.poliza_ganada_id is null
      and coalesce(o.info_riesgo->>'origen', '') <> ${ORIGEN_RETENCION}
    limit 2000`
  if (ops.length === 0) return { ganadas: [], ambiguas: 0, solicitudesConPoliza: 0 }
  const pols = await tx.$queryRaw<{ id: string; clienteId: string; dniHash: string | null; ramo: string | null; codigoDgs: string | null; numeroPoliza: string | null; creadaEn: Date; previa: boolean; aseguradora: string | null }[]>`
    select p.id::text as id, p.cliente_id::text as "clienteId", c.dni_lookup_hash as "dniHash", p.tipo::text as ramo,
           p.codigo_entidad_dgs as "codigoDgs", p.numero_poliza as "numeroPoliza", p.created_at as "creadaEn", p.aseguradora,
           exists (select 1 from polizas v
                   where v.correduria_id = p.correduria_id and v.cliente_id = p.cliente_id and v.id <> p.id
                     and v.codigo_entidad_dgs is not distinct from p.codigo_entidad_dgs and v.tipo = p.tipo
                     and v.created_at < p.created_at) as previa
    from polizas p
    join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
    where p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null and ${viva}
      and p.estado::text = any(${vigentes}::text[]) and p.sustituida_at is null
      and p.created_at >= now() - make_interval(days => ${VENTANA_DIAS}::int)
      and not exists (select 1 from oportunidades g where g.poliza_ganada_id = p.id)
    limit 2000`
  if (pols.length === 0) return { ganadas: [], ambiguas: 0, solicitudesConPoliza: 0 }
  const sols = await opcional(tx, 'enlace_solicitudes', () => tx.$queryRaw<SolicitudEmitidaEnlace[]>`
    select id::text as id, codigo_entidad_dgs as "codigoDgs", numero_poliza as "numeroPoliza", oportunidad_id::text as "oportunidadId"
    from solicitud_compania
    where correduria_id = ${correduriaId}::uuid and numero_poliza is not null and poliza_id is null
    limit 500`, [] as SolicitudEmitidaEnlace[])

  const oportunidades: OportunidadEnlace[] = ops.map((o) => ({
    id: o.id, clienteId: o.clienteId, dniHash: o.dniHash, ramo: o.ramo,
    codigoDgs: dgsDeOportunidad({ companiaSolicitud: o.companiaSolicitud, aseguradoraGanadora: o.aseguradoraGanadora }),
    creadaEn: o.creadaEn.toISOString(),
  }))
  const polizas: PolizaNuevaEnlace[] = pols.map((p) => ({
    id: p.id, clienteId: p.clienteId, dniHash: p.dniHash, ramo: p.ramo, codigoDgs: p.codigoDgs, numeroPoliza: p.numeroPoliza,
    creadaEn: p.creadaEn.toISOString(), previaMismoRiesgo: p.previa,
  }))
  const d = decidirEnlacesPolizaOportunidad(oportunidades, polizas, sols)
  const opPorId = new Map(ops.map((o) => [o.id, o]))
  const polPorId = new Map(pols.map((p) => [p.id, p]))

  let solicitudesConPoliza = 0
  for (const s of d.solicitudesConPoliza) {
    const n = await opcional(tx, 'enlace_solicitud_poliza', () => tx.$executeRaw`
      update solicitud_compania set poliza_id = ${s.polizaId}::uuid, updated_at = now()
      where id = ${s.solicitudId}::uuid and correduria_id = ${correduriaId}::uuid and poliza_id is null`, 0)
    solicitudesConPoliza += n
  }

  const ganadas: { id: string; estado: string }[] = []
  for (const e of d.enlaces) {
    const o = opPorId.get(e.oportunidadId)
    const p = polPorId.get(e.polizaId)
    if (!o || !p) continue
    const n = await tx.$executeRaw`
      update oportunidades set estado = 'ganada', cerrada_at = now(), updated_at = now(),
             poliza_ganada_id = ${p.id}::uuid,
             aseguradora_ganadora = coalesce(aseguradora_ganadora, ${p.aseguradora}),
             numero_poliza = coalesce(numero_poliza, ${p.numeroPoliza})
      where id = ${o.id}::uuid and correduria_id = ${correduriaId}::uuid and estado::text = ${o.estado} and poliza_ganada_id is null`
    if (n === 0) continue
    const via = e.via === 'solicitud' ? 'la solicitud de la compañía (nº de póliza del correo)' : 'mismo tomador, compañía y ramo'
    await tx.$executeRaw`
      update gestiones set estado = 'cerrada', updated_at = now(),
             observaciones = observaciones || ${`\n— Cerrada sola: la póliza ${p.numeroPoliza ?? ''} ya ha entrado en cartera (${via}).`}
      where oportunidad_id = ${o.id}::uuid and correduria_id = ${correduriaId}::uuid and estado <> 'cerrada'`
    await tx.$executeRaw`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${o.id}::uuid, 'emitida_en_cartera', cast(${o.estado} as estado_comercial), 'ganada',
              ${JSON.stringify({ polizaGanadaId: p.id, via: e.via, solicitudId: e.solicitudId })}::jsonb, 'sistema:cartera')`
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${o.clienteId}::uuid, ${p.id}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Oportunidad ${o.ramo ?? 'sin ramo'} ganada sola: la póliza ${p.numeroPoliza ?? 'nueva'} ha entrado por CIMA (${via}).`.slice(0, 2000)})`
    ganadas.push({ id: o.id, estado: o.estado })
  }

  let ambiguas = 0
  for (const a of d.ambiguos) {
    const p = polPorId.get(a.polizaId)
    if (!p) continue
    const texto = textoAvisoEnlaceAmbiguo({
      numeroPoliza: p.numeroPoliza, ramo: p.ramo, codigoDgs: p.codigoDgs, candidatas: a.oportunidades.length, motivo: a.motivo,
    })
    const n = await opcional(tx, 'enlace_aviso', () => tx.$executeRaw`
      insert into correo_cruce_aviso (correduria_id, tipo, clave, texto, cliente_id)
      values (${correduriaId}::uuid, 'enlace_ambiguo', ${`enlace_ambiguo:${p.id}`}, ${texto}, ${p.clienteId}::uuid)
      on conflict (correduria_id, clave) do nothing`, 0)
    ambiguas += n
  }
  return { ganadas, ambiguas, solicitudesConPoliza }
}
