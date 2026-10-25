/**
 * «Pedir precio» desde Patrimonio del portal (24/10/2026, P14): el cliente pide que le pasen precio de seguro para un
 * inmueble SIN seguro (o con el seguro caducado). Convierte la petición en una OPORTUNIDAD (`fuente = 'portal'`,
 * `info_riesgo.origen = 'portal:patrimonio'`) con una gestión `llamada` de prioridad alta para hoy, deja constancia en la
 * ficha y avisa a Alberto por Telegram (solo ids). Es el hermano de `mejorar-precio-portal.ts` y NO de `lead-declarada.ts`.
 *
 * ─── Por qué esta puerta es estrecha ────────────────────────────────────────
 * Como el resto de `/api/portal/*` NO recibe `clienteId`: la ficha dueña sale del INMUEBLE (`portal_patrimonio_titular`,
 * de la única correduría) y el nivel de esa identidad sobre ella se RECALCULA aquí con la misma regla pura que el portal
 * (`puedePatrimonio(..., 'pedir_precio')`: solo `total`, nunca un acceso de gestión ni el inquilino). Ajeno, archivado o
 * sin nivel = `no_encontrado`. Asegura tampoco se fía de que el portal haya comprobado el estado: si el inmueble tiene un
 * seguro confirmado en vigor, o no se puede saber, `no_aplica` y no se escribe nada.
 *
 * Idempotente: si ya hay una petición abierta del portal para ese inmueble (últimos 120 días), se devuelve la que hay. El
 * doble clic y el reintento tras un corte son el caso normal. Las tablas `portal_patrimonio_*` no están en
 * `prisma/asegura.prisma` (las modela el portal): SQL crudo parametrizado.
 */
import { tgSend } from '@central/core-telegram'
import { declaradaVigente } from '@central/module-patrimonio'
import { sqlCarteraEnVigor } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { Prisma } from './generated/asegura-client'
import { sqlDeclaradaViva } from './declaradas-eliminadas'
import { puedePatrimonio } from './patrimonio-inquilino-portal'
import {
  ORIGEN_PORTAL_PATRIMONIO,
  aplicaPedirPrecio,
  ramoDeUso,
  textoAvisoPedirPrecio,
  textoTareaPrecioPatrimonio,
  type PeticionPedirPrecio,
} from './patrimonio-pedir-precio-reglas'

const ACTOR = 'el cliente, desde el portal (patrimonio)'
/** Una petición más vieja que esto ya no bloquea pedir otra. */
const DIAS_PETICION_VIVA = 120

export type ResultadoPedirPrecio =
  | { estado: 'ok'; pedidoEl: string; yaExistia: boolean }
  | { estado: 'no_encontrado' }
  | { estado: 'no_aplica' }

const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

const ABIERTA = Prisma.sql`o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
  and o.info_riesgo->>'origen' = ${ORIGEN_PORTAL_PATRIMONIO}
  and o.created_at > now() - make_interval(days => ${DIAS_PETICION_VIVA}::int)`

export async function pedirPrecioPatrimonio(correduriaId: string, d: PeticionPedirPrecio): Promise<ResultadoPedirPrecio> {
  const db = prismaAsegura()
  // La ficha dueña sale del inmueble, nunca del cuerpo. Archivado o de otra correduría = como si no existiera.
  const [inm] = await db.$queryRaw<{ cliente_id: string; alias: string; uso: string | null }[]>(Prisma.sql`
    select t.cliente_id::text as cliente_id, i.alias, i.uso
    from portal_patrimonio_inmueble i
    join portal_patrimonio_titular t on t.id = i.titular_id
    where i.id = ${d.inmuebleId}::uuid and i.archivado_en is null
      and t.archivado_en is null and t.correduria_id = ${correduriaId}::uuid`)
  if (!inm) return { estado: 'no_encontrado' }
  if (!(await puedePatrimonio(correduriaId, d.identidadId, inm.cliente_id, 'pedir_precio'))) return { estado: 'no_encontrado' }

  // Los seguros ENLAZADOS (confirmados y vivos) y si siguen en vigor: cartera por `sqlCarteraEnVigor`, declarada por la
  // misma regla pura del portal. No se fía de lo que el portal dijo del estado.
  const enlaces = await db.$queryRaw<{
    cartera_id: string | null; en_vigor: boolean | null
    declarada_id: string | null; declarada_viva_id: string | null; fecha_vencimiento: Date | null; vigente_declarada: string | null
  }[]>(Prisma.sql`
    select e.poliza_id::text as cartera_id, (${Prisma.raw(sqlCarteraEnVigor('p'))}) as en_vigor,
           e.poliza_declarada_id::text as declarada_id, d.id::text as declarada_viva_id, d.fecha_vencimiento, d.vigente_declarada
    from portal_patrimonio_inmueble_poliza e
    left join polizas p on p.id = e.poliza_id and p.correduria_id = ${correduriaId}::uuid
    left join portal_poliza_declarada d on d.id = e.poliza_declarada_id and ${sqlDeclaradaViva('d')}
    where e.inmueble_id = ${d.inmuebleId}::uuid and e.archivado_en is null and e.estado = 'confirmado'`)
  const hoy = new Date()
  const vigencias = enlaces.map((e): boolean | null => {
    if (e.cartera_id !== null) return e.en_vigor === null ? null : e.en_vigor
    if (e.declarada_id !== null) {
      // El `join` solo trae las NO eliminadas: si la fila no llega, la quitó el cliente → no está en vigor.
      if (e.declarada_viva_id === null) return false
      return declaradaVigente({ eliminadaEn: null, fechaVencimiento: e.fecha_vencimiento, vigenteDeclarada: e.vigente_declarada }, hoy)
    }
    return null
  })
  if (!aplicaPedirPrecio(d.tipo, vigencias)) return { estado: 'no_aplica' }

  const ramo = ramoDeUso(inm.uso)
  const hoyIso = hoyMadrid()
  const r = await db.$transaction(async (tx) => {
    // Un doble clic son dos peticiones a la vez: el candado las pone en fila.
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`${ORIGEN_PORTAL_PATRIMONIO}:${inm.cliente_id}:${d.inmuebleId}:${ramo}`}))`)
    const [ya] = await tx.$queryRaw<{ pedidoEl: string }[]>(Prisma.sql`
      select to_char(o.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "pedidoEl"
      from oportunidades o
      where o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${inm.cliente_id}::uuid
        and o.info_riesgo->>'inmuebleId' = ${d.inmuebleId} and ${ABIERTA}
      order by o.created_at limit 1`)
    if (ya) return { pedidoEl: ya.pedidoEl, yaExistia: true, oportunidadId: null as string | null }

    const info = JSON.stringify({ origen: ORIGEN_PORTAL_PATRIMONIO, inmuebleId: d.inmuebleId, tipo: d.tipo })
    const [o] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into oportunidades (correduria_id, cliente_id, tipo, fuente, estado, info_riesgo)
      values (${correduriaId}::uuid, ${inm.cliente_id}::uuid, cast(${ramo} as tipo_seguro), 'portal', 'en_negociacion', ${info}::jsonb)
      returning id::text as id`)
    const tarea = textoTareaPrecioPatrimonio({ tipo: d.tipo, alias: inm.alias, ramo })
    await tx.$executeRaw(Prisma.sql`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, oportunidad_id, origen_trigger)
      values (${correduriaId}::uuid, cast('llamada' as gestion_tipo), 'alta', 'pendiente', ${tarea},
              (${hoyIso}::date + time '23:59:59') at time zone 'Europe/Madrid',
              ${inm.cliente_id}::uuid, null, ${o!.id}::uuid, 'central:seguimiento')`)
    // Sin la nota libre ni el alias: `oportunidad_historial` no se puede borrar (supresión RGPD).
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${o!.id}::uuid, 'creada_portal', null, 'en_negociacion',
              ${JSON.stringify({ inmuebleId: d.inmuebleId, tipo: d.tipo })}::jsonb, ${ACTOR})`)
    return { pedidoEl: hoyIso, yaExistia: false, oportunidadId: o!.id }
  })

  if (!r.yaExistia && r.oportunidadId) {
    // Best-effort: la oportunidad y la tarea ya están; tumbar la respuesta por la bitácora o el aviso le diría al
    // cliente que no se guardó lo que sí.
    try {
      await db.$executeRaw(Prisma.sql`
        insert into historial_interno (correduria_id, cliente_id, tipo, texto)
        values (${correduriaId}::uuid, ${inm.cliente_id}::uuid, cast('contacto' as tipo_historial_interno),
                ${'Pidió desde Patrimonio (portal) que le pasen precio de seguro para uno de sus inmuebles.'})`)
    } catch (e) {
      console.error('[pedir-precio-patrimonio] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
    }
    try {
      await tgSend(textoAvisoPedirPrecio({ oportunidadId: r.oportunidadId, inmuebleId: d.inmuebleId }), { html: false })
    } catch (e) {
      console.error('[pedir-precio-patrimonio] aviso a Telegram no enviado:', e instanceof Error ? e.message : e)
    }
  }
  return { estado: 'ok', pedidoEl: r.pedidoEl, yaExistia: r.yaExistia }
}
