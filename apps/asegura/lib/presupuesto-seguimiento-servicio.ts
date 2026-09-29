// Seguimiento de presupuestos enviados, con BD: qué presupuestos toca recordarle a Alberto (el
// cliente no lo ha abierto en 48 h, o lo abrió y no eligió en 72 h) y qué ha hecho el cliente en el
// portal. Lo sirve `GET /api/operador/presupuesto/seguimiento`; plataforma decide cómo avisar y lo
// apunta con `PATCH /api/operador/presupuesto { accion:'seguimiento_avisado' }`.
//
// 🚨 Un fallo de lectura LANZA: la ruta lo convierte en `{estado:'error', causa}`. Una lista vacía
// diría «no hay nada que seguir» sobre presupuestos que nadie ha mirado.

import { seguimientoPendiente } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { TIPO_ACTIVIDAD } from './presupuesto-actividad'
import { ESTADOS_ABIERTA } from './codeoscopic/oportunidad-presupuesto-reglas'
import {
  TIPO_SEGUIMIENTO_AVISADO, agregarActividad, etapasAvisadas, type ActividadResumida, type Etapa,
} from './presupuesto-seguimiento'

export const LIMITE_SEGUIMIENTO = 200

export type Pendiente = {
  id: string
  clienteId: string
  tomador: string
  ramo: string
  etapa: Etapa
  enviadoAt: string
  /** NULL = no consta que lo abriera, no «no lo abrió». */
  vistoAt: string | null
  actividad: ActividadResumida | null
}

type FilaCandidato = {
  id: string; cliente_id: string; tomador: string; ramo: string
  enviado_at: Date; visto_at: Date | null; vence_el: Date
}

export async function presupuestosEnSeguimiento(correduriaId: string, ahora = new Date()): Promise<Pendiente[]> {
  const db = prismaAsegura()
  const candidatos = await db.$queryRaw<FilaCandidato[]>`
    select p.id::text as id, p.cliente_id::text as cliente_id,
           trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))) as tomador,
           p.ramo, p.enviado_at, p.visto_at, p.vence_el
    from presupuesto p join clientes c on c.id = p.cliente_id
    where p.correduria_id = ${correduriaId}::uuid
      and p.enviado_at is not null
      and p.retirado_at is null and p.aceptado_at is null and p.elegido_at is null
      and p.vence_el > ${ahora}
    order by p.enviado_at asc
    limit ${LIMITE_SEGUIMIENTO}
  `
  if (candidatos.length === 0) return []
  const ids = candidatos.map((c) => c.id)

  const eventos = await db.presupuestoEvento.findMany({
    where: { presupuestoId: { in: ids }, tipo: { in: [TIPO_SEGUIMIENTO_AVISADO, TIPO_ACTIVIDAD] } },
    select: { presupuestoId: true, tipo: true, ocurridoAt: true, detalle: true },
  })
  const opciones = await db.presupuestoOpcion.findMany({
    where: { presupuestoId: { in: ids }, ocultaAt: null },
    select: { id: true, presupuestoId: true, compania: true },
  })

  const out: Pendiente[] = []
  for (const c of candidatos) {
    const suyos = eventos.filter((e) => e.presupuestoId === c.id)
    const etapa = seguimientoPendiente({
      enviadoAt: c.enviado_at, vistoAt: c.visto_at, elegidoAt: null, aceptadoAt: null, retiradoAt: null,
      venceEl: c.vence_el, avisadas: etapasAvisadas(suyos),
    }, ahora)
    if (!etapa) continue
    out.push({
      id: c.id,
      clienteId: c.cliente_id,
      tomador: c.tomador,
      ramo: c.ramo,
      etapa,
      enviadoAt: c.enviado_at.toISOString(),
      vistoAt: c.visto_at ? c.visto_at.toISOString() : null,
      actividad: agregarActividad(suyos, c.ramo, opciones.filter((o) => o.presupuestoId === c.id)),
    })
  }
  return out
}

export type ResultadoAvisado =
  | { estado: 'ok'; yaConstaba: boolean }
  | { estado: 'error'; motivo: 'no_encontrado' }

/**
 * Apunta que Alberto ya fue avisado de esa etapa. Idempotente: si ya consta, `ok` sin escribir otra
 * fila (el libro es append-only; dos filas iguales no dirían nada más).
 */
export async function marcarSeguimientoAvisado(
  correduriaId: string,
  e: { id: string; etapa: Etapa; actor: string },
): Promise<ResultadoAvisado> {
  const db = prismaAsegura()
  const p = await db.presupuesto.findFirst({ where: { id: e.id, correduriaId }, select: { id: true } })
  if (!p) return { estado: 'error', motivo: 'no_encontrado' }
  const previos = await db.presupuestoEvento.findMany({
    where: { presupuestoId: e.id, tipo: TIPO_SEGUIMIENTO_AVISADO },
    select: { tipo: true, ocurridoAt: true, detalle: true },
  })
  if (etapasAvisadas(previos).includes(e.etapa)) return { estado: 'ok', yaConstaba: true }
  await db.presupuestoEvento.create({
    data: { presupuestoId: e.id, tipo: TIPO_SEGUIMIENTO_AVISADO, origen: 'corredor', detalle: { etapa: e.etapa, actor: e.actor } },
  })
  await tareaDeSeguimiento(correduriaId, e.id, e.etapa)
  return { estado: 'ok', yaConstaba: false }
}

/**
 * Además del Telegram, una LLAMADA para hoy en «Hoy», colgada de la oportunidad abierta de ese cliente
 * y ramo (Alberto, 28/09/2026). Un aviso que se lee en el móvil y se olvida no es un seguimiento.
 * Best-effort: si no hay oportunidad abierta, o ya hay una llamada pendiente en ella, no se crea nada;
 * y un fallo aquí no deshace el «avisado» (el Telegram ya salió).
 */
async function tareaDeSeguimiento(correduriaId: string, presupuestoId: string, etapa: Etapa): Promise<void> {
  const db = prismaAsegura()
  const observaciones = etapa === 'sin_abrir'
    ? 'Llamar: no ha abierto el presupuesto en 48 h'
    : 'Llamar: abrió el presupuesto y no ha elegido en 72 h'
  try {
    await db.$executeRaw`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
      select p.correduria_id, 'llamada', 'alta', 'pendiente', ${observaciones},
             ((now() at time zone 'Europe/Madrid')::date + time '23:59:59') at time zone 'Europe/Madrid',
             p.cliente_id, o.id, 'central:seguimiento-presupuesto'
      from presupuesto p
      join oportunidades o on o.correduria_id = p.correduria_id and o.cliente_id = p.cliente_id
                          and o.tipo::text = p.ramo and o.estado::text = any(${[...ESTADOS_ABIERTA]}::text[])
      where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid
        and not exists (
          select 1 from gestiones g
          where g.oportunidad_id = o.id and g.estado::text = 'pendiente' and g.tipo::text = 'llamada'
        )
      order by o.created_at
      limit 1`
  } catch (err) {
    console.error('[seguimiento-presupuestos] no se pudo crear la llamada de seguimiento', presupuestoId, err instanceof Error ? err.message : err)
  }
}
