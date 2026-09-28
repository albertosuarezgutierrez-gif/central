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
  return { estado: 'ok', yaConstaba: false }
}
