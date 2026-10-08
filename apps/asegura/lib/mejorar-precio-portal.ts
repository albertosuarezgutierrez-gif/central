/**
 * «Quiero que me mejores el precio», pedido por el cliente desde su portal
 * (pieza 1-5 de ASegura OS, 23/09/2026).
 *
 * Lo que hace: convierte la petición en una OPORTUNIDAD (`en_negociacion`,
 * fuente `renovacion`) con una TAREA para hoy, prioridad alta. Así aparece en
 * «Hoy · Tareas de hoy» de plataforma sin pantalla nueva. Y deja constancia en
 * la ficha del cliente.
 *
 * ─── Por qué esta puerta es estrecha ────────────────────────────────────────
 * Como el resto de `/api/portal/*`, NO recibe `clienteId`: la póliza tiene que
 * ser de una ficha que esa identidad tiene vinculada (`portal_vinculo`) y estar
 * EN VIGOR. Una póliza de un tercero que te ha autorizado a verla no vale: el
 * que decide mejorar el precio de un seguro es su tomador.
 *
 * Idempotente: si ya hay una petición abierta del portal para esa póliza, no
 * se crea otra (se devuelve la que hay). El doble clic y el reintento tras un
 * corte son el caso normal, no el raro.
 */
import {
  enVentanaVencimientos,
  diasHastaVencimientoPortal,
  textoTareaPrecio,
  validarPeticionPrecio,
} from '@central/module-seguros-portal'
import { sqlCarteraEnVigor } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { fichaPropiaDeRecurso, fichasDeIdentidad } from './contacto-portal'
import { Prisma } from './generated/asegura-client'
import { sqlPrimaDeRecibo, sqlVencimientoConRecibos } from './recibos-vigencia'

/** Marca de origen en `oportunidades.info_riesgo`. La leen la idempotencia y la lectura de peticiones abiertas. */
export const ORIGEN_PORTAL_PRECIO = 'portal:mejorar-precio'
const ACTOR = 'el cliente, desde el portal'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Una petición más vieja que esto ya no bloquea pedir otra (sería de la renovación anterior). */
const DIAS_PETICION_VIVA = 120

export type PeticionAbierta = { polizaId: string; pedidoEl: string }

export type ResultadoPeticionPrecio =
  | { estado: 'ok'; pedidoEl: string; yaExistia: boolean }
  | { estado: 'invalido'; motivo: string }
  /** No es una póliza de una ficha vinculada a esta identidad (con nivel de operar), o no existe. */
  | { estado: 'no_encontrada' }
  /** La ficha dueña SÍ está vinculada pero de solo consulta: se dice aparte de «no encontrada». */
  | { estado: 'sin_permiso' }
  /** ES suya, pero no está en cartera en vigor (`sqlCarteraEnVigor`): el portal dice «ya no está en vigor». */
  | { estado: 'no_en_vigor' }
  | { estado: 'fuera_de_ventana' }
  | { estado: 'sin_ficha' }

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

const ABIERTA = Prisma.sql`o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
  and o.info_riesgo->>'origen' = ${ORIGEN_PORTAL_PRECIO}
  and o.created_at > now() - make_interval(days => ${DIAS_PETICION_VIVA}::int)`

/** Las peticiones abiertas de esta identidad, para pintar «ya lo pediste». */
export async function peticionesPrecioAbiertas(correduriaId: string, identidadId: string): Promise<PeticionAbierta[] | 'sin_ficha'> {
  const fichas = await fichasDeIdentidad(correduriaId, identidadId)
  if (fichas.length === 0) return 'sin_ficha'
  return prismaAsegura().$queryRaw<PeticionAbierta[]>(Prisma.sql`
    select o.info_riesgo->>'polizaId' as "polizaId",
           to_char(min(o.created_at) at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "pedidoEl"
    from oportunidades o
    where o.correduria_id = ${correduriaId}::uuid
      and o.cliente_id in (${Prisma.join(fichas.map(f => Prisma.sql`${f}::uuid`))})
      and ${ABIERTA}
    group by 1`)
}

export async function pedirMejorarPrecio(
  correduriaId: string,
  identidadId: string,
  polizaId: string,
  cuerpo: unknown,
): Promise<ResultadoPeticionPrecio> {
  if (!UUID.test(polizaId)) return { estado: 'invalido', motivo: 'Póliza no válida.' }
  const v = validarPeticionPrecio(cuerpo)
  if (!v.ok) return { estado: 'invalido', motivo: v.motivo }
  // La ficha es la DUEÑA de la póliza, si es una de las vinculadas con nivel de operar: con varias fichas
  // vinculadas no hay que elegir, y una póliza de una ficha no vinculada (o de solo lectura) no vale.
  const ficha = await fichaPropiaDeRecurso(correduriaId, identidadId, 'poliza', polizaId)
  if (ficha.estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (ficha.estado === 'ajena') return { estado: 'no_encontrada' }
  if (ficha.estado === 'sin_permiso') return { estado: 'sin_permiso' }
  // El route convierte lo lanzado en 503 con el clasificador de errores de cartera.
  if (ficha.estado === 'error') throw new Error(`mejorar-precio: ${ficha.causa}`)

  const db = prismaAsegura()
  const hoy = hoyMadrid()
  // Allianz no manda prima en la póliza ni avanza su vencimiento al renovar:
  // solo el recibo anual (27/09/2026). Sin esto, una Allianz renovada seguiría
  // «vencida» aquí mientras el portal —que ya lee el recibo— le enseña el
  // botón con la fecha nueva, y la petición rebotaría con `fuera_de_ventana`.
  const [p] = await db.$queryRaw<{
    clienteId: string; ramo: string; compania: string | null; numeroPoliza: string | null
    fechaVencimiento: string | null; prima: string | null; enVigor: boolean
  }[]>(Prisma.sql`
    select p.cliente_id::text as "clienteId", p.tipo::text as ramo, p.aseguradora as compania,
           coalesce(${Prisma.raw(sqlCarteraEnVigor('p'))}, false) as "enVigor",
           p.numero_poliza as "numeroPoliza", to_char(${sqlVencimientoConRecibos('p', hoy)}, 'YYYY-MM-DD') as "fechaVencimiento",
           coalesce(nullif(coalesce(p.prima_bruta, p.prima_anual), 0), ${sqlPrimaDeRecibo('p', hoy)})::text as prima
    from polizas p
    where p.id = ${polizaId}::uuid and p.correduria_id = ${correduriaId}::uuid
      and p.merged_into_poliza_id is null
      and p.cliente_id = ${ficha.clienteId}::uuid`)
  if (!p) return { estado: 'no_encontrada' }
  // Suya pero fuera de cartera en vigor: se dice así, no como «no es tuya» (se sigue sin pedir nada).
  if (!p.enVigor) return { estado: 'no_en_vigor' }
  if (!p.fechaVencimiento || !enVentanaVencimientos(diasHastaVencimientoPortal(p.fechaVencimiento, hoy))) {
    return { estado: 'fuera_de_ventana' }
  }

  const tarea = textoTareaPrecio({ ramo: p.ramo, compania: p.compania, numeroPoliza: p.numeroPoliza, fechaVencimiento: p.fechaVencimiento, peticion: v.peticion })
  const r = await db.$transaction(async tx => {
    // Un doble clic son dos peticiones a la vez: el candado las pone en fila.
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`${ORIGEN_PORTAL_PRECIO}:${polizaId}`}))`)
    const [ya] = await tx.$queryRaw<{ pedidoEl: string }[]>(Prisma.sql`
      select to_char(o.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "pedidoEl"
      from oportunidades o
      where o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${p.clienteId}::uuid
        and o.info_riesgo->>'polizaId' = ${polizaId} and ${ABIERTA}
      order by o.created_at limit 1`)
    if (ya) return { pedidoEl: ya.pedidoEl, yaExistia: true }

    const info = JSON.stringify({
      origen: ORIGEN_PORTAL_PRECIO, polizaId,
      prioridad: v.peticion.prioridad, canal: v.peticion.canal, momento: v.peticion.momento,
    })
    const [o] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into oportunidades (correduria_id, cliente_id, tipo, fuente, estado, fecha_fin_vigencia, numero_poliza, prima_bruta, info_riesgo)
      values (${correduriaId}::uuid, ${p.clienteId}::uuid, cast(${p.ramo} as tipo_seguro), 'renovacion', 'en_negociacion',
              ${p.fechaVencimiento}::date, ${p.numeroPoliza}, ${p.prima}::numeric, ${info}::jsonb)
      returning id::text as id`)
    await tx.$executeRaw(Prisma.sql`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, oportunidad_id, origen_trigger)
      values (${correduriaId}::uuid, cast(${v.peticion.canal === 'llamada' ? 'llamada' : 'email'} as gestion_tipo), 'alta', 'pendiente',
              ${tarea}, (${hoy}::date + time '23:59:59') at time zone 'Europe/Madrid',
              ${p.clienteId}::uuid, ${polizaId}::uuid, ${o.id}::uuid, 'central:seguimiento')`)
    // Sin la nota libre: `oportunidad_historial` no se puede borrar (supresión RGPD).
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${o.id}::uuid, 'creada_portal', null, 'en_negociacion',
              ${JSON.stringify({ polizaId, prioridad: v.peticion.prioridad, canal: v.peticion.canal })}::jsonb, ${ACTOR})`)
    return { pedidoEl: hoy, yaExistia: false }
  })

  if (!r.yaExistia) {
    // Best-effort: la oportunidad y la tarea ya están; tumbar la respuesta por
    // el renglón de bitácora le diría al cliente que no se guardó lo que sí.
    try {
      await db.$executeRaw(Prisma.sql`
        insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
        values (${correduriaId}::uuid, ${p.clienteId}::uuid, ${polizaId}::uuid, cast('contacto' as tipo_historial_interno),
                ${`Pidió desde el portal que le mejoren el precio de su ${p.ramo}${p.compania ? ` (${p.compania})` : ''}.`})`)
    } catch (e) {
      console.error('[mejorar-precio] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
    }
  }
  return { estado: 'ok', pedidoEl: r.pedidoEl, yaExistia: r.yaExistia }
}
