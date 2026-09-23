// apps/asegura/lib/oportunidad-seguimiento.ts
//
// Escrituras del seguimiento de una oportunidad (Fase 1 de ASegura OS, PR B):
// cambiar su estado y crear/cerrar sus tareas (tabla heredada `gestiones`).
// Las reglas —qué transición vale y qué exige— están en
// `@central/module-seguros` (`aplicarAccion`, `validarTarea`); aquí solo se
// aplican contra la BD.
//
// Tres garantías, las tres en la MISMA transacción que el cambio:
//   1. La oportunidad es de esta correduría (con BYPASSRLS un id ajeno no
//      falla: escribiría en la de otro).
//   2. El estado se relee con `FOR UPDATE` antes de decidir: dos clics a la
//      vez no pueden aplicar dos transiciones sobre el mismo estado viejo.
//   3. Cada cambio deja su fila en `oportunidad_historial` (append-only) con
//      antes/después y quién. Si esa fila no se puede escribir, no se escribe
//      nada: un cambio sin rastro no se hace.
// Además, best-effort y fuera de la transacción, una línea en
// `historial_interno` para que se vea en la ficha del cliente.
//
// El SQL crudo NO prefija `seguros.`: la conexión ya trae `?schema=seguros`
// (mismo criterio que el resto de `lib/cartera-*.ts`).

import {
  aplicarAccion,
  planLlamada,
  validarTarea,
  type CambiosOportunidad,
  type EstadoOportunidad,
  type PeticionAccion,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Fallo = { ok: false; estado: 'invalido' | 'no_encontrado' | 'conflicto'; motivo: string; status: 404 | 409 | 422 }

export type OportunidadSeguimiento = {
  id: string
  clienteId: string
  ramo: string | null
  estado: EstadoOportunidad
  fechaFinVigencia: string | null
  motivoPerdida: string | null
  motivoDetalle: string | null
  competidor: string | null
  primaCompetidor: number | null
  aparcadaHasta: string | null
  aparcadaMotivo: string | null
  cerradaAt: string | null
  polizaGanadaId: string | null
}

/** Lo que se añade a una tarea que cierra el sistema al ganar/perder: no es un contacto y no cuenta como intento. */
export const MARCA_CIERRE_AUTOMATICO = '— Cerrada al marcar la oportunidad como'
/** Lo que se añade a una llamada pendiente que se da por hecha al registrar otra: la que cuenta es el registro, no esta. */
export const MARCA_CIERRE_LLAMADA = '— Cerrada al registrar una llamada.'

export type ContextoOportunidad = { cliente: string | null; aseguradora: string | null; fueCliente: boolean }

export type EntradaHistorial = {
  accion: string
  estadoAntes: string | null
  estadoDespues: string | null
  detalle: unknown
  actor: string
  fecha: string
}

export type Tarea = {
  id: string
  tipo: string
  prioridad: string
  estado: string
  observaciones: string
  fechaLimite: string | null
  creada: string
}

function hoyUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function dia(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

type FilaOportunidad = {
  id: string
  clienteId: string
  ramo: string | null
  estado: EstadoOportunidad
  fechaFin: Date | null
  motivoPerdida: string | null
  motivoDetalle: string | null
  competidor: string | null
  primaCompetidor: number | null
  aparcadaHasta: Date | null
  aparcadaMotivo: string | null
  cerradaAt: Date | null
  polizaGanadaId: string | null
}

const SELECT_OPORTUNIDAD = Prisma.sql`
  select id::text as id, cliente_id::text as "clienteId", tipo::text as ramo, estado::text as estado,
         fecha_fin_vigencia as "fechaFin", motivo_perdida as "motivoPerdida",
         motivo_perdida_detalle as "motivoDetalle", competidor,
         prima_competidor::float8 as "primaCompetidor", aparcada_hasta as "aparcadaHasta",
         aparcada_motivo as "aparcadaMotivo", cerrada_at as "cerradaAt", poliza_ganada_id::text as "polizaGanadaId"
  from oportunidades`

function mapOportunidad(f: FilaOportunidad): OportunidadSeguimiento {
  return {
    id: f.id,
    clienteId: f.clienteId,
    ramo: f.ramo,
    estado: f.estado,
    fechaFinVigencia: dia(f.fechaFin),
    motivoPerdida: f.motivoPerdida,
    motivoDetalle: f.motivoDetalle,
    competidor: f.competidor,
    primaCompetidor: f.primaCompetidor,
    aparcadaHasta: dia(f.aparcadaHasta),
    aparcadaMotivo: f.aparcadaMotivo,
    cerradaAt: f.cerradaAt ? f.cerradaAt.toISOString() : null,
    polizaGanadaId: f.polizaGanadaId,
  }
}

/** La oportunidad con su historial y sus tareas. `null` = no existe o no es de esta correduría. */
export async function leerOportunidad(
  correduriaId: string,
  id: string,
): Promise<{ oportunidad: OportunidadSeguimiento; contexto: ContextoOportunidad; historial: EntradaHistorial[]; tareas: Tarea[] } | null> {
  if (!UUID.test(id)) return null
  const db = prismaAsegura()
  const [fila] = await db.$queryRaw<FilaOportunidad[]>(Prisma.sql`
    ${SELECT_OPORTUNIDAD} where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
  if (!fila) return null
  const [contexto, historial, tareas] = await Promise.all([
    // Para pintar la cabecera sin otra llamada: quién es y qué tiene en la
    // otra compañía. Sin datos de contacto: esos se piden a la ficha.
    db.$queryRaw<ContextoOportunidad[]>(Prisma.sql`
      select nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente,
             nullif(trim(o.poliza_competencia->>'aseguradora'), '') as aseguradora,
             exists (select 1 from polizas p where p.cliente_id = c.id and p.correduria_id = c.correduria_id
                     and p.merged_into_poliza_id is null and p.estado::text <> 'competencia') as "fueCliente"
      from oportunidades o join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
      where o.id = ${id}::uuid and o.correduria_id = ${correduriaId}::uuid`).then(r => r[0] ?? { cliente: null, aseguradora: null, fueCliente: false }),
    db.$queryRaw<{ accion: string; estadoAntes: string | null; estadoDespues: string | null; detalle: unknown; actor: string; fecha: Date }[]>(Prisma.sql`
      select accion, estado_antes::text as "estadoAntes", estado_despues::text as "estadoDespues",
             detalle, actor, created_at as fecha
      from oportunidad_historial
      where oportunidad_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
      order by created_at desc limit 100`),
    // La fecha límite se lee en hora de MADRID: las heredadas vencen a la
    // medianoche de Madrid (22:00/23:00 UTC) y cortadas en UTC saldrían un día antes.
    db.$queryRaw<{ id: string; tipo: string; prioridad: string; estado: string; observaciones: string; fechaLimite: string | null; creada: Date }[]>(Prisma.sql`
      select id::text as id, tipo::text as tipo, prioridad::text as prioridad, estado::text as estado,
             observaciones, to_char(fecha_limite at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "fechaLimite",
             created_at as creada
      from gestiones
      where oportunidad_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
      order by (estado = 'cerrada'), fecha_limite nulls last, created_at desc limit 100`),
  ])
  return {
    oportunidad: mapOportunidad(fila),
    contexto,
    historial: historial.map(h => ({ ...h, fecha: h.fecha.toISOString() })),
    tareas: tareas.map(t => ({ ...t, creada: t.creada.toISOString() })),
  }
}

/** Texto escrito a mano: puede llevar datos personales, y el historial no se
 *  puede borrar. De estos campos solo consta QUE cambiaron, no el valor. */
const TEXTO_LIBRE: ReadonlySet<keyof CambiosOportunidad> = new Set(['motivoDetalle', 'aparcadaMotivo'])

/** Solo los campos que cambian, con su antes y su después (salvo texto libre). */
function diferencias(antes: OportunidadSeguimiento, cambios: CambiosOportunidad): Record<string, unknown> {
  const pares: [keyof CambiosOportunidad, unknown][] = [
    ['motivoPerdida', antes.motivoPerdida],
    ['motivoDetalle', antes.motivoDetalle],
    ['competidor', antes.competidor],
    ['primaCompetidor', antes.primaCompetidor],
    ['aparcadaHasta', antes.aparcadaHasta],
    ['aparcadaMotivo', antes.aparcadaMotivo],
    ['polizaGanadaId', antes.polizaGanadaId],
  ]
  const out: Record<string, unknown> = {}
  for (const [campo, viejo] of pares) {
    const nuevo = cambios[campo]
    if (nuevo === undefined || nuevo === viejo) continue
    out[campo] = TEXTO_LIBRE.has(campo) ? { cambiado: true, vacio: nuevo === null } : { antes: viejo, despues: nuevo }
  }
  return out
}

export async function cambiarEstadoOportunidad(
  correduriaId: string,
  id: string,
  peticion: PeticionAccion,
  actor: string,
  hoy: Date = hoyUtc(),
): Promise<{ ok: true; oportunidad: OportunidadSeguimiento } | Fallo> {
  if (!UUID.test(id)) return { ok: false, estado: 'invalido', motivo: 'id de oportunidad no válido', status: 422 }
  const db = prismaAsegura()
  const r = await db.$transaction(async tx => {
    const [fila] = await tx.$queryRaw<FilaOportunidad[]>(Prisma.sql`
      ${SELECT_OPORTUNIDAD} where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid for update`)
    if (!fila) return { ok: false as const, estado: 'no_encontrado' as const, motivo: 'Esa oportunidad no es de esta correduría.', status: 404 as const }
    return transicionar(tx, correduriaId, mapOportunidad(fila), peticion, actor, hoy)
  })
  if (!r.ok) return r
  await anotarEnFicha(correduriaId, r.oportunidad.clienteId, textoCambio(peticion.accion, r.antes, r.oportunidad, actor))
  return { ok: true, oportunidad: r.oportunidad }
}

type Tx = Prisma.TransactionClient

/**
 * La transición sobre una oportunidad YA bloqueada (`for update`) por quien
 * llama: la usan el cambio de estado suelto y el registro de una llamada, que
 * la hace en la misma transacción que sus tareas.
 */
async function transicionar(
  tx: Tx,
  correduriaId: string,
  antes: OportunidadSeguimiento,
  peticion: PeticionAccion,
  actor: string,
  hoy: Date,
): Promise<{ ok: true; oportunidad: OportunidadSeguimiento; antes: OportunidadSeguimiento } | Fallo> {
  const id = antes.id
  // Primero la regla pura (valida también que la póliza sea un uuid); la
  // consulta de la póliza va después y sin `catch`: un error de BD es un
  // error, no «esa póliza no es de este cliente».
  const decidido = aplicarAccion({ estado: antes.estado, aparcadaHasta: antes.aparcadaHasta }, peticion, hoy)
  if (!decidido.ok) return { ok: false as const, estado: 'conflicto' as const, motivo: decidido.motivo, status: 422 as const }
  const c = decidido.cambios

  if (typeof c.polizaGanadaId === 'string') {
    const [pol] = await tx.$queryRaw<{ ok: number }[]>(Prisma.sql`
      select 1 as ok from polizas
      where id = ${c.polizaGanadaId}::uuid and correduria_id = ${correduriaId}::uuid and cliente_id = ${antes.clienteId}::uuid`)
    if (!pol) return { ok: false as const, estado: 'invalido' as const, motivo: 'Esa póliza no es de este cliente.', status: 422 as const }
  }

  // `undefined` = no tocar: COALESCE sobre un flag, no sobre el valor, para
  // que un `null` explícito SÍ borre (reabrir quita el motivo de pérdida).
  const [actualizada] = await tx.$queryRaw<FilaOportunidad[]>(Prisma.sql`
    update oportunidades set
      estado = cast(${c.estado} as estado_comercial),
      motivo_perdida = case when ${c.motivoPerdida !== undefined} then ${c.motivoPerdida ?? null} else motivo_perdida end,
      motivo_perdida_detalle = case when ${c.motivoDetalle !== undefined} then ${c.motivoDetalle ?? null} else motivo_perdida_detalle end,
      competidor = case when ${c.competidor !== undefined} then ${c.competidor ?? null} else competidor end,
      prima_competidor = case when ${c.primaCompetidor !== undefined} then ${c.primaCompetidor ?? null}::numeric else prima_competidor end,
      aparcada_hasta = case when ${c.aparcadaHasta !== undefined} then ${c.aparcadaHasta ?? null}::date else aparcada_hasta end,
      aparcada_motivo = case when ${c.aparcadaMotivo !== undefined} then ${c.aparcadaMotivo ?? null} else aparcada_motivo end,
      poliza_ganada_id = case when ${c.polizaGanadaId !== undefined} then ${c.polizaGanadaId ?? null}::uuid else poliza_ganada_id end,
      cerrada_at = case when ${c.cerrada === true} then now() when ${c.cerrada === false} then null else cerrada_at end,
      updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
    returning id::text as id, cliente_id::text as "clienteId", tipo::text as ramo, estado::text as estado,
      fecha_fin_vigencia as "fechaFin", motivo_perdida as "motivoPerdida",
      motivo_perdida_detalle as "motivoDetalle", competidor,
      prima_competidor::float8 as "primaCompetidor", aparcada_hasta as "aparcadaHasta",
      aparcada_motivo as "aparcadaMotivo", cerrada_at as "cerradaAt", poliza_ganada_id::text as "polizaGanadaId"`)

  const detalle: Record<string, unknown> = diferencias(antes, c)
  // Ganada, perdida o aparcada, sus tareas pendientes ya no tienen sentido: se
  // cierran aquí, en la misma transacción. Una aparcada vuelve en un año, y
  // volvería con «preparar la comparativa, vencida hace 363 días».
  if (c.cerrada === true || peticion.accion === 'aparcar') {
    const como = c.cerrada === true ? c.estado : 'aparcada'
    const cerradas = await tx.$executeRaw(Prisma.sql`
      update gestiones set estado = 'cerrada', updated_at = now(),
        observaciones = observaciones || ${`\n${MARCA_CIERRE_AUTOMATICO} ${como}.`}
      where oportunidad_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado <> 'cerrada'`)
    if (cerradas > 0) detalle.tareasCerradas = cerradas
  }
  await tx.$executeRaw(Prisma.sql`
    insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
    values (${correduriaId}::uuid, ${id}::uuid, ${peticion.accion},
            cast(${antes.estado} as estado_comercial), cast(${c.estado} as estado_comercial),
            ${JSON.stringify(detalle)}::jsonb, ${actor})`)
  return { ok: true as const, oportunidad: mapOportunidad(actualizada), antes }
}

const ETIQUETA_ACCION: Record<string, string> = {
  interesado: 'marcada como interesada',
  propuesta_enviada: 'propuesta enviada',
  ganar: 'GANADA',
  perder: 'perdida',
  aparcar: 'aparcada',
  reabrir: 'reabierta',
}

function textoCambio(accion: string, antes: OportunidadSeguimiento, despues: OportunidadSeguimiento, actor: string): string {
  const ramo = despues.ramo ?? 'sin ramo'
  let extra = ''
  if (accion === 'perder') extra = ` (motivo: ${despues.motivoPerdida}${despues.competidor ? `, se fue a ${despues.competidor}` : ''})`
  if (accion === 'aparcar') extra = ` hasta el ${despues.aparcadaHasta}`
  return `Oportunidad ${ramo} ${ETIQUETA_ACCION[accion] ?? accion}${extra} — antes «${antes.estado}», por ${actor}`
}

export async function crearTarea(
  correduriaId: string,
  oportunidadId: string,
  datos: { tipo?: unknown; prioridad?: unknown; observaciones?: unknown; fechaLimite?: unknown },
  actor: string,
  hoy: Date = hoyUtc(),
): Promise<{ ok: true; tareaId: string } | Fallo> {
  if (!UUID.test(oportunidadId)) return { ok: false, estado: 'invalido', motivo: 'id de oportunidad no válido', status: 422 }
  const v = validarTarea(datos, hoy)
  if (!v.ok) return { ok: false, estado: 'invalido', motivo: v.motivo, status: 422 }
  const t = v.tarea
  const db = prismaAsegura()
  const r = await db.$transaction(async tx => {
    const [opp] = await tx.$queryRaw<{ clienteId: string; estado: string }[]>(Prisma.sql`
      select cliente_id::text as "clienteId", estado::text as estado from oportunidades
      where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!opp) return null
    if (opp.estado === 'ganada' || opp.estado === 'perdida') return 'cerrada' as const
    // Vence al final del día EN MADRID, que es donde se trabaja.
    const [nueva] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
      values (${correduriaId}::uuid, cast(${t.tipo} as gestion_tipo), cast(${t.prioridad} as gestion_prioridad),
              'pendiente', ${t.observaciones}, (${t.fechaLimite}::date + time '23:59:59') at time zone 'Europe/Madrid',
              ${opp.clienteId}::uuid, ${oportunidadId}::uuid, 'central:seguimiento')
      returning id::text as id`)
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'tarea_creada',
              cast(${opp.estado} as estado_comercial), cast(${opp.estado} as estado_comercial),
              ${JSON.stringify({ tareaId: nueva.id, tipo: t.tipo, fechaLimite: t.fechaLimite })}::jsonb, ${actor})`)
    return { tareaId: nueva.id, clienteId: opp.clienteId }
  })
  if (!r) return { ok: false, estado: 'no_encontrado', motivo: 'Esa oportunidad no es de esta correduría.', status: 404 }
  if (r === 'cerrada') return { ok: false, estado: 'conflicto', motivo: 'Esa oportunidad ya está cerrada: reábrela antes de añadirle tareas.', status: 409 }
  await anotarEnFicha(correduriaId, r.clienteId, `Tarea (${t.tipo}) para el ${t.fechaLimite}: ${t.observaciones.slice(0, 140)} — por ${actor}`)
  return { ok: true, tareaId: r.tareaId }
}

export async function cerrarTarea(
  correduriaId: string,
  tareaId: string,
  resultado: string | null,
  actor: string,
): Promise<{ ok: true } | Fallo> {
  if (!UUID.test(tareaId)) return { ok: false, estado: 'invalido', motivo: 'id de tarea no válido', status: 422 }
  const db = prismaAsegura()
  const r = await db.$transaction(async tx => {
    const [t] = await tx.$queryRaw<{ oportunidadId: string | null; clienteId: string | null; estado: string }[]>(Prisma.sql`
      select oportunidad_id::text as "oportunidadId", cliente_id::text as "clienteId", estado::text as estado
      from gestiones where id = ${tareaId}::uuid and correduria_id = ${correduriaId}::uuid
        and oportunidad_id is not null for update`)
    if (!t) return 'no_encontrado' as const
    if (t.estado === 'cerrada') return 'ya_cerrada' as const
    await tx.$executeRaw(Prisma.sql`
      update gestiones set estado = 'cerrada',
        observaciones = case when ${resultado !== null} then observaciones || E'\n— Resultado: ' || ${resultado ?? ''} else observaciones end,
        updated_at = now()
      where id = ${tareaId}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (t.oportunidadId) {
      await tx.$executeRaw(Prisma.sql`
        insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
        select ${correduriaId}::uuid, o.id, 'tarea_cerrada', o.estado, o.estado,
               ${JSON.stringify({ tareaId, conResultado: resultado !== null })}::jsonb, ${actor}
        from oportunidades o where o.id = ${t.oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid`)
    }
    return t
  })
  if (r === 'no_encontrado') return { ok: false, estado: 'no_encontrado', motivo: 'No hay tarea de seguimiento con ese id en esta correduría.', status: 404 }
  if (r === 'ya_cerrada') return { ok: false, estado: 'conflicto', motivo: 'Esa tarea ya estaba cerrada.', status: 409 }
  if (r.clienteId) await anotarEnFicha(correduriaId, r.clienteId, `Tarea cerrada${resultado ? `: ${resultado.slice(0, 140)}` : ''} — por ${actor}`)
  return { ok: true }
}

/**
 * Registra el resultado de una llamada en UNA transacción: la llamada queda
 * como tarea `llamada` cerrada (cuenta como intento), las llamadas pendientes
 * que vencían hoy se dan por hechas, y se aplican el cambio de estado y la
 * siguiente tarea que decide `planLlamada`. Primero se valida todo: si el
 * cambio de estado no vale, no se escribe nada.
 */
export async function registrarLlamada(
  correduriaId: string,
  oportunidadId: string,
  datos: { resultado?: unknown; nota?: unknown; volverEl?: unknown; motivo?: unknown },
  actor: string,
  hoy: Date = hoyUtc(),
): Promise<{ ok: true; resultado: string; siguienteTareaId: string | null } | Fallo> {
  if (!UUID.test(oportunidadId)) return { ok: false, estado: 'invalido', motivo: 'id de oportunidad no válido', status: 422 }
  const hoyIso = hoy.toISOString().slice(0, 10)
  const db = prismaAsegura()
  const r = await db.$transaction(async tx => {
    const [fila] = await tx.$queryRaw<FilaOportunidad[]>(Prisma.sql`
      ${SELECT_OPORTUNIDAD} where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid for update`)
    if (!fila) return { ok: false as const, estado: 'no_encontrado' as const, motivo: 'Esa oportunidad no es de esta correduría.', status: 404 as const }
    const antes = mapOportunidad(fila)
    const decidido = planLlamada(datos, antes.estado, hoy)
    if (!decidido.ok) return { ok: false as const, estado: 'invalido' as const, motivo: decidido.motivo, status: 422 as const }
    const plan = decidido.plan

    // El cambio de estado va el PRIMERO: si no vale, se sale sin haber escrito nada.
    let despues = antes
    if (plan.accion) {
      const t = await transicionar(tx, correduriaId, antes, plan.accion, actor, hoy)
      if (!t.ok) return t
      despues = t.oportunidad
    }
    await tx.$executeRaw(Prisma.sql`
      update gestiones set estado = 'cerrada', updated_at = now(),
        observaciones = observaciones || ${`\n${MARCA_CIERRE_LLAMADA}`}
      where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
        and origen_trigger = 'central:seguimiento' and tipo::text = 'llamada' and estado <> 'cerrada'
        and fecha_limite <= (${hoyIso}::date + time '23:59:59') at time zone 'Europe/Madrid'`)
    await tx.$executeRaw(Prisma.sql`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
      values (${correduriaId}::uuid, 'llamada', 'media', 'cerrada', ${plan.registro},
              (${hoyIso}::date + time '23:59:59') at time zone 'Europe/Madrid',
              ${antes.clienteId}::uuid, ${oportunidadId}::uuid, 'central:seguimiento')`)
    let siguienteTareaId: string | null = null
    if (plan.siguiente) {
      const t = plan.siguiente
      const [nueva] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
        values (${correduriaId}::uuid, cast(${t.tipo} as gestion_tipo), cast(${t.prioridad} as gestion_prioridad),
                'pendiente', ${t.observaciones}, (${t.fechaLimite}::date + time '23:59:59') at time zone 'Europe/Madrid',
                ${antes.clienteId}::uuid, ${oportunidadId}::uuid, 'central:seguimiento')
        returning id::text as id`)
      siguienteTareaId = nueva.id
    }
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'llamada',
              cast(${antes.estado} as estado_comercial), cast(${despues.estado} as estado_comercial),
              ${JSON.stringify({ resultado: plan.resultado, siguienteTareaId, fechaSiguiente: plan.siguiente?.fechaLimite ?? null })}::jsonb, ${actor})`)
    return { ok: true as const, clienteId: antes.clienteId, registro: plan.resultado, siguienteTareaId }
  })
  if (!r.ok) return r
  await anotarEnFicha(correduriaId, r.clienteId, `${ETIQUETA_LLAMADA[r.registro] ?? 'Llamada'} — por ${actor}`)
  return { ok: true, resultado: r.registro, siguienteTareaId: r.siguienteTareaId }
}

/** Texto del registro: el prefijo lo reconoce quien lea el historial como contacto por WhatsApp. */
export const REGISTRO_WHATSAPP = 'WhatsApp de seguimiento abierto desde Vencimientos (lo envía el corredor a mano).'

/**
 * Deja constancia de que Alberto ha abierto el WhatsApp de seguimiento de un
 * lead (23/09/2026). El mensaje lo envía él desde su teléfono: esto NO envía
 * nada, solo anota el contacto para que cuente como intento y la secuencia
 * pase al paso siguiente (recordatorio → llamada).
 *
 * Una vez por día y oportunidad: pulsar dos veces el botón no son dos
 * contactos. Solo sobre oportunidades abiertas.
 */
export async function registrarWhatsapp(
  correduriaId: string,
  oportunidadId: string,
  actor: string,
  hoy: Date = hoyUtc(),
): Promise<{ ok: true; yaRegistrado: boolean } | Fallo> {
  if (!UUID.test(oportunidadId)) return { ok: false, estado: 'invalido', motivo: 'id de oportunidad no válido', status: 422 }
  const hoyIso = hoy.toISOString().slice(0, 10)
  const r = await prismaAsegura().$transaction(async tx => {
    const [fila] = await tx.$queryRaw<FilaOportunidad[]>(Prisma.sql`
      ${SELECT_OPORTUNIDAD} where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid for update`)
    if (!fila) return { ok: false as const, estado: 'no_encontrado' as const, motivo: 'Esa oportunidad no es de esta correduría.', status: 404 as const }
    const o = mapOportunidad(fila)
    if (o.estado === 'ganada' || o.estado === 'perdida') {
      return { ok: false as const, estado: 'conflicto' as const, motivo: `Esta oportunidad ya está ${o.estado}.`, status: 409 as const }
    }
    const [ya] = await tx.$queryRaw<{ n: number }[]>(Prisma.sql`
      select count(*)::int as n from gestiones
      where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
        and origen_trigger = 'central:seguimiento' and tipo::text = 'whatsapp' and estado::text = 'cerrada'
        and fecha_limite >= (${hoyIso}::date + time '00:00:00') at time zone 'Europe/Madrid'
        and fecha_limite <= (${hoyIso}::date + time '23:59:59') at time zone 'Europe/Madrid'`)
    if ((ya?.n ?? 0) > 0) return { ok: true as const, clienteId: o.clienteId, yaRegistrado: true }
    await tx.$executeRaw(Prisma.sql`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
      values (${correduriaId}::uuid, 'whatsapp', 'media', 'cerrada', ${REGISTRO_WHATSAPP},
              (${hoyIso}::date + time '23:59:59') at time zone 'Europe/Madrid',
              ${o.clienteId}::uuid, ${oportunidadId}::uuid, 'central:seguimiento')`)
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'whatsapp',
              cast(${o.estado} as estado_comercial), cast(${o.estado} as estado_comercial), '{}'::jsonb, ${actor})`)
    return { ok: true as const, clienteId: o.clienteId, yaRegistrado: false }
  })
  if (!r.ok) return r
  if (!r.yaRegistrado) await anotarEnFicha(correduriaId, r.clienteId, `WhatsApp de seguimiento abierto — por ${actor}`)
  return { ok: true, yaRegistrado: r.yaRegistrado }
}

const ETIQUETA_LLAMADA: Record<string, string> = {
  quiere_precio: 'Llamada: quiere precio (oportunidad interesada, comparativa pendiente)',
  otro_dia: 'Llamada: pide que le llamen otro día',
  no_contesta: 'Llamada: no contesta',
  no_interesa: 'Llamada: no le interesa (aparcada hasta el año que viene)',
}

export type TareaDeHoy = {
  id: string
  tipo: string
  prioridad: string
  observaciones: string
  /** Día límite en Madrid (aaaa-mm-dd). */
  fechaLimite: string
  oportunidadId: string
  estadoOportunidad: string
  clienteId: string
  /** `null` = la ficha no tiene nombre legible. */
  cliente: string | null
  ramo: string | null
}

const TECHO_TAREAS_HOY = 200

/**
 * Las tareas de seguimiento que vencen hoy o ya vencieron (para «Hoy» de
 * plataforma). Solo las de oportunidades abiertas: una tarea de una ganada o
 * perdida ya la cerró el sistema. `truncado` = hay más de las que se devuelven.
 */
export async function tareasDeHoy(
  correduriaId: string,
  // «Hoy» es el de Madrid: con la fecha UTC, entre las 00:00 y las 02:00 el
  // corte seguiría en ayer y las tareas de hoy no saldrían.
  hoyIso: string = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }),
): Promise<{ tareas: TareaDeHoy[]; truncado: boolean }> {
  const filas = await prismaAsegura().$queryRaw<TareaDeHoy[]>(Prisma.sql`
    select g.id::text as id, g.tipo::text as tipo, g.prioridad::text as prioridad,
           coalesce(g.observaciones, '') as observaciones,
           to_char(g.fecha_limite at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "fechaLimite",
           o.id::text as "oportunidadId", o.estado::text as "estadoOportunidad",
           c.id::text as "clienteId",
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente,
           o.tipo::text as ramo
    from gestiones g
    join oportunidades o on o.id = g.oportunidad_id and o.correduria_id = g.correduria_id
    join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
    where g.correduria_id = ${correduriaId}::uuid
      and g.origen_trigger = 'central:seguimiento' and g.estado::text <> 'cerrada'
      and g.fecha_limite <= (${hoyIso}::date + time '23:59:59') at time zone 'Europe/Madrid'
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
    order by g.fecha_limite, (g.prioridad::text = 'alta') desc
    limit ${TECHO_TAREAS_HOY + 1}`)
  return { tareas: filas.slice(0, TECHO_TAREAS_HOY), truncado: filas.length > TECHO_TAREAS_HOY }
}

async function anotarEnFicha(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`)
  } catch (e) {
    console.error('[oportunidad-seguimiento] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
