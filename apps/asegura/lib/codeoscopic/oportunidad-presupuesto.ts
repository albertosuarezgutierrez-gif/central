/**
 * Cuelga cada presupuesto guardado de la oportunidad del cliente para ese ramo
 * (24/09/2026). Si ya tiene una ABIERTA del mismo ramo, se enlaza a ella y pasa
 * de «por contactar» a «interesado»; si no, se abre una con su primer paso
 * (llamar para presentar el presupuesto), porque en este CRM ninguna oportunidad
 * vive sin siguiente paso.
 *
 * - Mismo candado que el alta a mano (`oportunidad:<cliente>:<ramo>`): un
 *   presupuesto y un alta a la vez no abren dos oportunidades del mismo seguro.
 * - El cliente se resuelve DENTRO de la correduría (el del contexto, o el de la
 *   póliza retarificada): con BYPASSRLS un id ajeno no falla, se cuelga de otro.
 * - Lo llama `cotizar()` DESPUÉS de guardar la copia, y nunca puede tumbarla: el
 *   precio ya está pagado. Un fallo aquí se devuelve como `no_enlazada`.
 */
import { prisma } from '../tenant.ts'
import type { ContextoCotizacion } from './cotizaciones.ts'
import { DIAS_PRIMER_PASO, ESTADOS_ABIERTA, estadoTrasPresupuesto, fuenteDePresupuesto, ramoDeOportunidad } from './oportunidad-presupuesto-reglas.ts'

export type EnlaceOportunidad =
  | { estado: 'enlazada' | 'creada'; oportunidadId: string }
  | { estado: 'omitida'; motivo: string }
  | { estado: 'no_enlazada'; motivo: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function enlazarPresupuestoConOportunidad(e: {
  correduriaId: string
  contexto: ContextoCotizacion
  cotizacionId: string
  solicitadoPor: string
}): Promise<EnlaceOportunidad> {
  const ramo = ramoDeOportunidad(e.contexto.ramo)
  if (!ramo) return { estado: 'omitida', motivo: `el ramo «${e.contexto.ramo}» no es un ramo de oportunidad` }
  const polizaId = e.contexto.polizaId && UUID.test(e.contexto.polizaId) ? e.contexto.polizaId : null
  const clienteCtx = e.contexto.clienteId && UUID.test(e.contexto.clienteId) ? e.contexto.clienteId : null
  if (!clienteCtx && !polizaId) return { estado: 'omitida', motivo: 'el presupuesto no dice de qué cliente es' }

  try {
    return await prisma.$transaction(async (tx) => {
      const [cli] = clienteCtx
        ? await tx.$queryRaw<{ id: string }[]>`
            select id::text as id from seguros.clientes
            where id = ${clienteCtx}::uuid and correduria_id = ${e.correduriaId}::uuid and merged_into_cliente_id is null`
        : await tx.$queryRaw<{ id: string }[]>`
            select c.id::text as id from seguros.polizas p
            join seguros.clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
            where p.id = ${polizaId}::uuid and p.correduria_id = ${e.correduriaId}::uuid and c.merged_into_cliente_id is null`
      if (!cli) return { estado: 'omitida' as const, motivo: 'el cliente no es de esta correduría' }
      const clienteId = cli.id

      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`oportunidad:${clienteId}:${ramo}`}))`
      const [ya] = await tx.$queryRaw<{ id: string; estado: string }[]>`
        select id::text as id, estado::text as estado from seguros.oportunidades
        where correduria_id = ${e.correduriaId}::uuid and cliente_id = ${clienteId}::uuid
          and tipo::text = ${ramo} and estado::text = any(${[...ESTADOS_ABIERTA]}::text[])
        order by created_at limit 1`

      let oportunidadId: string
      let resultado: 'enlazada' | 'creada'
      if (ya) {
        oportunidadId = ya.id
        resultado = 'enlazada'
        const nuevo = estadoTrasPresupuesto(ya.estado)
        if (nuevo !== ya.estado) {
          await tx.$executeRaw`
            update seguros.oportunidades set estado = cast(${nuevo} as seguros.estado_comercial), updated_at = now()
            where id = ${ya.id}::uuid and correduria_id = ${e.correduriaId}::uuid`
        }
        await tx.$executeRaw`
          insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
          values (${e.correduriaId}::uuid, ${ya.id}::uuid, 'presupuestada', cast(${ya.estado} as seguros.estado_comercial),
                  cast(${nuevo} as seguros.estado_comercial), ${JSON.stringify({ cotizacionId: e.cotizacionId })}::jsonb, ${e.solicitadoPor})`
      } else {
        const [o] = await tx.$queryRaw<{ id: string }[]>`
          insert into seguros.oportunidades (correduria_id, cliente_id, tipo, fuente, estado, info_riesgo)
          values (${e.correduriaId}::uuid, ${clienteId}::uuid, cast(${ramo} as seguros.tipo_seguro),
                  cast(${fuenteDePresupuesto(polizaId)} as seguros.fuente_origen), 'en_negociacion',
                  ${JSON.stringify({ origen: 'ficha:presupuesto', polizaId })}::jsonb)
          returning id::text as id`
        oportunidadId = o.id
        resultado = 'creada'
        await tx.$executeRaw`
          insert into seguros.gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
          values (${e.correduriaId}::uuid, 'llamada', 'media', 'pendiente', 'Presentarle el presupuesto',
                  (((now() at time zone 'Europe/Madrid')::date + ${DIAS_PRIMER_PASO}::int) + time '23:59:59') at time zone 'Europe/Madrid',
                  ${clienteId}::uuid, ${o.id}::uuid, 'central:seguimiento')`
        await tx.$executeRaw`
          insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
          values (${e.correduriaId}::uuid, ${o.id}::uuid, 'creada_presupuesto', null, 'en_negociacion',
                  ${JSON.stringify({ ramo, cotizacionId: e.cotizacionId, conPoliza: polizaId !== null })}::jsonb, ${e.solicitadoPor})`
      }
      await tx.$executeRaw`
        update seguros.tarificaciones set oportunidad_id = ${oportunidadId}::uuid
        where id = ${e.cotizacionId}::uuid and correduria_id = ${e.correduriaId}::uuid`
      return { estado: resultado, oportunidadId }
    })
  } catch (err) {
    return { estado: 'no_enlazada', motivo: err instanceof Error ? err.message : String(err) }
  }
}
