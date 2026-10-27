/**
 * «El inquilino PIDE precio» (27/10/2026) — lado con BD del puente `POST /api/portal/patrimonio/inquilino-precio`. Reglas
 * y textos en `patrimonio-inquilino-precio-reglas.ts` (léelo antes de tocar esto).
 *
 * Qué hace: (1) si la misma identidad del portal ya tiene una petición abierta de este origen (120 días), la devuelve;
 * (2) da de alta una ficha NUEVA de lead (`altaCliente`, `fuente='portal'`, `forzar`: nunca se funde con otra por el
 * móvil o el correo); (3) abre la oportunidad con su tarea `llamada` de hoy y su rastro; (4) avisa a Alberto por Telegram
 * con ids. No escribe NADA en las tablas del patrimonio ni lee las del propietario: el portal ya resolvió el acceso del
 * inquilino a su contrato (`accesoParaContrato`, la frontera del código) y aquí no se necesita ningún dato de ese contrato.
 *
 * ⚠️ Carrera conocida: dos peticiones simultáneas de la misma identidad pueden crear dos fichas (el alta tiene su propia
 * transacción). La oportunidad sí queda una sola (candado + recomprobación); la otra ficha queda como lead sin oportunidad
 * y se fusiona a mano. El portal lo frena antes (botón bloqueado mientras envía + tope por identidad).
 */
import { tgSend } from '@central/core-telegram'

import { prismaAsegura } from './asegura-db'
import { altaCliente } from './cartera-edicion'
import { Prisma } from './generated/asegura-client'
import {
  DIAS_SOLICITUD_VIVA,
  ORIGEN_INQUILINO_PRECIO,
  cuerpoAltaInquilino,
  infoRiesgoSolicitud,
  ramoSolicitudInquilino,
  textoAvisoInquilino,
  textoTareaInquilino,
  type SolicitudInquilino,
} from './patrimonio-inquilino-precio-reglas'

const ACTOR = 'el inquilino, desde el portal (Mi alquiler)'

export type ResultadoSolicitudInquilino =
  | { estado: 'ok'; pedidoEl: string; yaExistia: boolean }
  | { estado: 'invalido'; campo: string }

const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

async function abierta(tx: Pick<ReturnType<typeof prismaAsegura>, '$queryRaw'>, correduriaId: string, identidadId: string): Promise<string | null> {
  const [ya] = await tx.$queryRaw<{ pedidoEl: string }[]>(Prisma.sql`
    select to_char(o.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "pedidoEl"
    from oportunidades o
    where o.correduria_id = ${correduriaId}::uuid
      and o.info_riesgo->>'origen' = ${ORIGEN_INQUILINO_PRECIO}
      and o.info_riesgo->>'identidadPortal' = ${identidadId}
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and o.created_at > now() - make_interval(days => ${DIAS_SOLICITUD_VIVA}::int)
    order by o.created_at limit 1`)
  return ya?.pedidoEl ?? null
}

export async function pedirPrecioInquilino(correduriaId: string, d: SolicitudInquilino): Promise<ResultadoSolicitudInquilino> {
  const db = prismaAsegura()
  const previa = await abierta(db, correduriaId, d.identidadId)
  if (previa !== null) return { estado: 'ok', pedidoEl: previa, yaExistia: true }

  const alta = await altaCliente(correduriaId, cuerpoAltaInquilino(d), ACTOR)
  if (!alta.ok) {
    if (alta.estado === 'invalido') return { estado: 'invalido', campo: alta.campo === 'email' || alta.campo === 'telefono' ? 'contacto' : (alta.campo ?? 'datos') }
    throw new Error(`inquilino-precio: alta ${alta.estado}`)
  }
  const fichaId = alta.id
  // ¿El contacto ya estaba en otra ficha? Lo dice la columna espejo: `altaCliente` no la rellena si otra ficha lo tiene.
  const [f] = await db.$queryRaw<{ espejo: boolean }[]>(Prisma.sql`
    select (c.telefono_lookup_hash is not null or c.email_lookup_hash is not null) as espejo
    from clientes c where c.id = ${fichaId}::uuid and c.correduria_id = ${correduriaId}::uuid`)
  const contactoEnOtraFicha = f ? !f.espejo : false

  const hoyIso = hoyMadrid()
  const ramo = ramoSolicitudInquilino(d.que)
  const r = await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`${ORIGEN_INQUILINO_PRECIO}:${d.identidadId}`}))`)
    const ya = await abierta(tx, correduriaId, d.identidadId)
    if (ya !== null) return { pedidoEl: ya, yaExistia: true, oportunidadId: null as string | null }
    const info = JSON.stringify(infoRiesgoSolicitud(d))
    const [o] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into oportunidades (correduria_id, cliente_id, tipo, fuente, estado, info_riesgo)
      values (${correduriaId}::uuid, ${fichaId}::uuid, cast(${ramo} as tipo_seguro), 'portal', 'en_negociacion', ${info}::jsonb)
      returning id::text as id`)
    await tx.$executeRaw(Prisma.sql`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, oportunidad_id, origen_trigger)
      values (${correduriaId}::uuid, cast('llamada' as gestion_tipo), 'alta', 'pendiente',
              ${textoTareaInquilino({ que: d.que, canal: d.canal, contactoEnOtraFicha })},
              (${hoyIso}::date + time '23:59:59') at time zone 'Europe/Madrid',
              ${fichaId}::uuid, null, ${o!.id}::uuid, 'central:seguimiento')`)
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${o!.id}::uuid, 'creada_portal', null, 'en_negociacion',
              ${JSON.stringify({ tipo: 'inquilino_hogar', que: d.que })}::jsonb, ${ACTOR})`)
    return { pedidoEl: hoyIso, yaExistia: false, oportunidadId: o!.id }
  })

  if (!r.yaExistia && r.oportunidadId) {
    // Best-effort: la oportunidad y la tarea ya están.
    try {
      await tgSend(textoAvisoInquilino({ oportunidadId: r.oportunidadId, que: d.que }), { html: false })
    } catch (e) {
      console.error('[inquilino-precio] aviso a Telegram no enviado:', e instanceof Error ? e.message : e)
    }
  }
  return { estado: 'ok', pedidoEl: r.pedidoEl, yaExistia: r.yaExistia }
}
