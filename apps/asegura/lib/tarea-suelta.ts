// apps/asegura/lib/tarea-suelta.ts
//
// «Hecho» y «Posponer N días» sobre una TAREA SUELTA (13/10/2026): una gestión abierta SIN oportunidad
// (casi todas de la agenda del CRM anterior) que Mi mesa lista en `tareasSueltas`. `cerrarTarea` y
// `posponerOportunidad` de `oportunidad-seguimiento.ts` exigen oportunidad (su rastro va a
// `oportunidad_historial`), así que estas tareas no tenían salida. Aquí:
//
//   · Aislamiento: la tarea se lee por `id` + `correduria_id` con `FOR UPDATE` (rol con BYPASSRLS: un id
//     ajeno sin ese filtro escribiría en la de otra correduría) y la escritura repite el filtro.
//   · Solo SUELTAS: una tarea con oportunidad va por su seguimiento (409), para no saltarse su historial
//     ni la recurrencia anual de la llamada.
//   · Los hitos del recibo devuelto (art. 15 LCS, prefijo `PREFIJO_TAREA_DEVOLUCION`) NO se cierran ni
//     se posponen por aquí: llevan el plazo legal (409). Hoy siempre cuelgan de una oportunidad; la
//     guarda está por si alguno llega suelto.
//   · Rastro: sin `oportunidad_historial` posible, lo que se hizo y quién queda en la propia tarea
//     (`observaciones`), en `historial_interno` si cuelga de una ficha, y en la auditoría del puerto.
//
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.

import { fechaPospuesta, validarTarea } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { rechazoSuelta, type FalloSuelta, type FilaSuelta } from './tarea-suelta-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function hoyMadridIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

type Tx = Prisma.TransactionClient

const NO_ENCONTRADA = rechazoSuelta(undefined)!

async function leerSuelta(tx: Tx, correduriaId: string, tareaId: string): Promise<(FilaSuelta & { fecha: string | null }) | undefined> {
  const [t] = await tx.$queryRaw<(FilaSuelta & { fecha: string | null })[]>(Prisma.sql`
    select oportunidad_id::text as "oportunidadId", cliente_id::text as "clienteId", estado::text as estado, observaciones,
           to_char(fecha_limite at time zone 'Europe/Madrid', 'YYYY-MM-DD') as fecha
    from gestiones where id = ${tareaId}::uuid and correduria_id = ${correduriaId}::uuid for update`)
  return t
}

/** «Hecho»: la tarea suelta queda cerrada, con el resultado (si lo hay) y quién la cerró. */
export async function cerrarTareaSuelta(
  correduriaId: string,
  tareaId: string,
  resultado: string | null,
  actor: string,
): Promise<{ ok: true } | FalloSuelta> {
  if (!UUID.test(tareaId)) return { ok: false, estado: 'invalido', motivo: 'id de tarea no válido', status: 422 }
  const nota = `\n— Hecha por ${actor}${resultado ? `: ${resultado}` : ''}`
  const r = await prismaAsegura().$transaction(async (tx) => {
    const t = await leerSuelta(tx, correduriaId, tareaId)
    const no = rechazoSuelta(t)
    if (no || !t) return no ?? NO_ENCONTRADA
    await tx.$executeRaw(Prisma.sql`
      update gestiones set estado = 'cerrada', observaciones = coalesce(observaciones, '') || ${nota}, updated_at = now()
      where id = ${tareaId}::uuid and correduria_id = ${correduriaId}::uuid and oportunidad_id is null`)
    return { ok: true as const, clienteId: t.clienteId, antes: t.estado }
  })
  if (!r.ok) return r
  anotarCambio({ entidad: 'gestion', id: tareaId, campo: 'estado', antes: r.antes, despues: 'cerrada' })
  if (r.clienteId) await anotarEnFicha(correduriaId, r.clienteId, `Tarea cerrada${resultado ? `: ${resultado.slice(0, 140)}` : ''} — por ${actor}`)
  return { ok: true }
}

/** «Posponer N días»: la fecha límite pasa a hoy + N (Madrid). Se MUEVE, no se cierra. */
export async function posponerTareaSuelta(
  correduriaId: string,
  tareaId: string,
  dias: unknown,
  actor: string,
  hoyIso: string = hoyMadridIso(),
): Promise<{ ok: true; fecha: string } | FalloSuelta> {
  if (!UUID.test(tareaId)) return { ok: false, estado: 'invalido', motivo: 'id de tarea no válido', status: 422 }
  const p = fechaPospuesta(dias, hoyIso)
  if (!p.ok) return { ok: false, estado: 'invalido', motivo: p.motivo, status: 422 }
  const nota = `\n— Pospuesta ${p.dias} día${p.dias === 1 ? '' : 's'} (al ${p.fecha}) por ${actor}`
  const r = await prismaAsegura().$transaction(async (tx) => {
    const t = await leerSuelta(tx, correduriaId, tareaId)
    const no = rechazoSuelta(t)
    if (no || !t) return no ?? NO_ENCONTRADA
    await tx.$executeRaw(Prisma.sql`
      update gestiones set fecha_limite = (${p.fecha}::date + time '23:59:59') at time zone 'Europe/Madrid',
        observaciones = coalesce(observaciones, '') || ${nota}, updated_at = now()
      where id = ${tareaId}::uuid and correduria_id = ${correduriaId}::uuid and oportunidad_id is null`)
    return { ok: true as const, clienteId: t.clienteId, antes: t.fecha }
  })
  if (!r.ok) return r
  anotarCambio({ entidad: 'gestion', id: tareaId, campo: 'fecha_limite', antes: r.antes, despues: p.fecha })
  if (r.clienteId) await anotarEnFicha(correduriaId, r.clienteId, `Tarea pospuesta ${p.dias} día${p.dias === 1 ? '' : 's'} (al ${p.fecha}) — por ${actor}`)
  return { ok: true, fecha: p.fecha }
}

// ── Tareas de una PÓLIZA o de un CLIENTE (14/10/2026) ──────────────────────────────────────────────
//
// «Pedir cambio de cuenta», «cambio de matrícula», llamar al cliente…: una tarea SUELTA (sin oportunidad)
// en la MISMA tabla `gestiones`, colgada del cliente (`cliente_id`) y, si es de una póliza, también de ella
// (`poliza_id`; ambas columnas e índices ya existían). Al ser suelta sale en «Tareas sueltas» de Mi mesa y se
// cierra/pospone por la misma vía (`cerrarTareaSuelta`). Mismas reglas que una tarea a mano (`validarTarea`).
// Desde la póliza el cliente sale de la póliza (nunca del cuerpo); desde la ficha la póliza es opcional y
// tiene que ser DE ese cliente.

/** Origen de las tareas creadas desde la pantalla de una póliza o de la ficha de cliente. */
export const ORIGEN_TAREA_POLIZA = 'central:poliza'
export const ORIGEN_TAREA_CLIENTE = 'central:cliente'

export type TareaVinculada = {
  id: string
  tipo: string
  prioridad: string
  estado: string
  /** `observaciones`; `''` si no tiene texto (no se inventa uno). */
  texto: string
  /** Fecha límite (Madrid, aaaa-mm-dd). `null` = sin fecha. */
  fecha: string | null
  polizaId: string | null
  /** Nº de la póliza (para el chip). `null` = sin póliza o sin número. */
  polizaNumero: string | null
  /** Si cuelga de una oportunidad, se gestiona desde ella (no por la vía de las sueltas). */
  oportunidadId: string | null
  origen: string | null
  creada: string
}

export type DondeTareas = { polizaId: string } | { clienteId: string }

const TECHO_TAREAS_VINCULADAS = 100

/**
 * Las tareas de la póliza, o las del cliente + las de todas sus pólizas. Abiertas primero (por fecha),
 * luego las cerradas más recientes. 404 si la póliza/ficha no es de esta correduría.
 */
export async function tareasVinculadas(
  correduriaId: string,
  donde: DondeTareas,
): Promise<{ ok: true; tareas: TareaVinculada[]; truncado: boolean } | FalloSuelta> {
  const id = 'polizaId' in donde ? donde.polizaId : donde.clienteId
  if (!UUID.test(id)) return { ok: false, estado: 'invalido', motivo: 'id no válido', status: 422 }
  const db = prismaAsegura()
  const [existe] = 'polizaId' in donde
    ? await db.$queryRaw<{ id: string }[]>(Prisma.sql`select id::text as id from polizas where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
    : await db.$queryRaw<{ id: string }[]>(Prisma.sql`select id::text as id from clientes where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
  if (!existe) return { ok: false, estado: 'no_encontrado', motivo: 'No consta en esta correduría.', status: 404 }
  const filtro = 'polizaId' in donde
    ? Prisma.sql`g.poliza_id = ${id}::uuid`
    : Prisma.sql`(g.cliente_id = ${id}::uuid or g.poliza_id in (
        select p.id from polizas p where p.cliente_id = ${id}::uuid and p.correduria_id = ${correduriaId}::uuid))`
  const filas = await db.$queryRaw<(Omit<TareaVinculada, 'texto' | 'creada'> & { texto: string | null; creada: Date })[]>(Prisma.sql`
    select g.id::text as id, g.tipo::text as tipo, g.prioridad::text as prioridad, g.estado::text as estado, g.observaciones as texto,
           to_char(g.fecha_limite at time zone 'Europe/Madrid', 'YYYY-MM-DD') as fecha,
           g.poliza_id::text as "polizaId", nullif(trim(p.numero_poliza), '') as "polizaNumero",
           g.oportunidad_id::text as "oportunidadId", g.origen_trigger as origen, g.created_at as creada
    from gestiones g
    left join polizas p on p.id = g.poliza_id and p.correduria_id = g.correduria_id
    where g.correduria_id = ${correduriaId}::uuid and ${filtro}
    order by (g.estado::text = 'cerrada'),
             case when g.estado::text <> 'cerrada' then g.fecha_limite end nulls last,
             g.updated_at desc
    limit ${TECHO_TAREAS_VINCULADAS + 1}`)
  return {
    ok: true,
    tareas: filas.slice(0, TECHO_TAREAS_VINCULADAS).map((f) => ({ ...f, texto: f.texto ?? '', creada: f.creada.toISOString() })),
    truncado: filas.length > TECHO_TAREAS_VINCULADAS,
  }
}

/**
 * Alta de una tarea suelta colgada de una póliza (el cliente sale de ella) o de un cliente (póliza opcional,
 * que tiene que ser suya: 409 si no). Sin oportunidad.
 */
export async function crearTareaVinculada(
  correduriaId: string,
  donde: { polizaId?: unknown; clienteId?: unknown },
  datos: { tipo?: unknown; prioridad?: unknown; observaciones?: unknown; fechaLimite?: unknown },
  actor: string,
  hoyIso: string = hoyMadridIso(),
): Promise<{ ok: true; tareaId: string } | FalloSuelta> {
  const polizaId = typeof donde.polizaId === 'string' && donde.polizaId.trim() !== '' ? donde.polizaId.trim() : null
  const clienteBody = typeof donde.clienteId === 'string' && donde.clienteId.trim() !== '' ? donde.clienteId.trim() : null
  if (!polizaId && !clienteBody) return { ok: false, estado: 'invalido', motivo: 'falta polizaId o clienteId', status: 422 }
  if ((polizaId && !UUID.test(polizaId)) || (clienteBody && !UUID.test(clienteBody))) {
    return { ok: false, estado: 'invalido', motivo: 'id no válido', status: 422 }
  }
  const v = validarTarea(datos, new Date(`${hoyIso}T00:00:00Z`))
  if (!v.ok) return { ok: false, estado: 'invalido', motivo: v.motivo, status: 422 }
  const t = v.tarea
  const db = prismaAsegura()
  let clienteId: string | null = clienteBody
  if (polizaId) {
    const [pol] = await db.$queryRaw<{ clienteId: string | null }[]>(Prisma.sql`
      select cliente_id::text as "clienteId" from polizas where id = ${polizaId}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!pol) return { ok: false, estado: 'no_encontrado', motivo: 'No hay póliza con ese id en esta correduría.', status: 404 }
    if (clienteBody && pol.clienteId !== clienteBody) {
      return { ok: false, estado: 'conflicto', motivo: 'Esa póliza no es de este cliente.', status: 409 }
    }
    clienteId = pol.clienteId
  } else {
    const [cli] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id::text as id from clientes where id = ${clienteBody}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!cli) return { ok: false, estado: 'no_encontrado', motivo: 'No hay cliente con ese id en esta correduría.', status: 404 }
  }
  // Vence al final del día EN MADRID, como las de seguimiento.
  const [nueva] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, origen_trigger)
    values (${correduriaId}::uuid, cast(${t.tipo} as gestion_tipo), cast(${t.prioridad} as gestion_prioridad), 'pendiente',
            ${t.observaciones}, (${t.fechaLimite}::date + time '23:59:59') at time zone 'Europe/Madrid',
            ${clienteId}::uuid, ${polizaId}::uuid, ${polizaId ? ORIGEN_TAREA_POLIZA : ORIGEN_TAREA_CLIENTE})
    returning id::text as id`)
  anotarCambio({ entidad: 'gestion', id: nueva.id, campo: 'alta', antes: null, despues: polizaId ? `poliza:${polizaId}` : `cliente:${clienteId}` })
  if (clienteId) {
    await anotarEnFicha(correduriaId, clienteId, `Tarea${polizaId ? ' de póliza' : ''} (${t.tipo}) para el ${t.fechaLimite}: ${t.observaciones.slice(0, 140)} — por ${actor}`, polizaId)
  }
  return { ok: true, tareaId: nueva.id }
}

async function anotarEnFicha(correduriaId: string, clienteId: string, texto: string, polizaId: string | null = null): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`)
  } catch (e) {
    console.error('[tarea-suelta] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
