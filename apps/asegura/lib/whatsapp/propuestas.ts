// Propuestas de la IA de WhatsApp: crear (desde el analizador), avisar por Telegram y RESOLVER (aplicar/descartar).
// Las reglas son PURAS en `propuestas-reglas.ts`. Resolver lo invoca `POST /api/operador/whatsapp/propuesta`, que llama
// el handler del callback `wap_` de plataforma (parte B). Un solo uso: la fila se RECLAMA con un UPDATE condicionado
// (`estado = 'pendiente'`), así dos pulsaciones a la vez aplican una vez y la otra recibe 409.
//
// 🚫 Aquí no hay ni puede haber `resolverDevolucion` (cerrar una devolución es el botón «cobrado de nuevo» de una persona):
//    lo vigila el cepo de `propuestas.test.ts`. La situación de un recibo NUNCA se toca; solo `fecha_prometida_pago`.
// 🛡️ Toda sentencia filtra `correduria_id`.

import { tgSendButtons, escapeHtml } from '@central/core-telegram'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { esColumnaAusente, esTablaAusente } from '../pg-error'
import { editarOportunidad } from '../oportunidad-seguimiento'
import { enlaceFichaCliente } from '../datos-cotizados'
import { eur } from '../dinero'
import { ORIGEN_TAREA_IA } from './ejecutor'
import { botonesPropuesta, lineaPropuesta, payloadPropuesta, puedeResolver, tareaAlAplicar, type Decision, type TipoPropuesta } from './propuestas-reglas'

const faltaMigracion = (e: unknown) => esTablaAusente(e) || esColumnaAusente(e)

export type NuevaPropuesta = {
  clienteId: string
  conversacionId: string
  tipo: TipoPropuesta
  reciboId: string | null
  oportunidadId: string | null
  fecha: string | null
}

export type PropuestaCreada = { ok: true; id: string } | { ok: false; motivo: 'ya_pendiente' | 'sin_migracion' | 'sin_ancla' | 'invalida' }

export async function crearPropuesta(correduriaId: string, p: NuevaPropuesta): Promise<PropuestaCreada> {
  if ((p.tipo === 'vencimiento' && !p.oportunidadId) || (p.tipo !== 'vencimiento' && !p.reciboId)) return { ok: false, motivo: 'sin_ancla' }
  const payload = payloadPropuesta(p.tipo, p.fecha)
  if (payload === null) return { ok: false, motivo: 'invalida' }
  try {
    const [fila] = await prismaAsegura().$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into whatsapp_propuestas (correduria_id, cliente_id, conversacion_id, tipo, recibo_id, oportunidad_id, payload)
      select ${correduriaId}::uuid, ${p.clienteId}::uuid, ${p.conversacionId}::uuid, ${p.tipo}, ${p.reciboId}::uuid, ${p.oportunidadId}::uuid,
             ${JSON.stringify(payload)}::jsonb
       where exists (select 1 from clientes where id = ${p.clienteId}::uuid and correduria_id = ${correduriaId}::uuid)
      on conflict do nothing
      returning id::text as id`)
    return fila ? { ok: true, id: fila.id } : { ok: false, motivo: 'ya_pendiente' }
  } catch (e) {
    if (faltaMigracion(e)) return { ok: false, motivo: 'sin_migracion' }
    throw e
  }
}

/** Datos para el aviso (ramo, importe del recibo, fecha): sin PII. */
type ResumenPropuesta = { id: string; tipo: TipoPropuesta; ramo: string | null; fecha: string | null; importe: string | null }

/**
 * Aviso a Alberto (Telegram, con botones ✅/❌ por propuesta) de lo que la IA ha hecho y propuesto en UNA conversación.
 * Nombre de pila + enlace a la ficha; ni DNI ni teléfono ni texto del cliente. Best effort: nunca lanza.
 * Guarda el `message_id` de Telegram en cada propuesta (para que plataforma edite el mensaje al resolver).
 */
export async function avisarTelegram(
  correduriaId: string,
  a: { clienteId: string; nombrePila: string | null; hechos: string[]; propuestas: { id: string }[] },
): Promise<'avisado' | 'sin_telegram' | 'nada' | 'error'> {
  if (a.hechos.length === 0 && a.propuestas.length === 0) return 'nada'
  try {
    const db = prismaAsegura()
    const ids = a.propuestas.map((p) => p.id)
    const filas = ids.length
      ? await db.$queryRaw<{ id: string; tipo: TipoPropuesta; ramo: string | null; fecha: string | null; importe: string | null }[]>(Prisma.sql`
          select w.id::text as id, w.tipo, coalesce(p.tipo::text, o.tipo::text) as ramo, w.payload->>'fecha' as fecha, r.prima_total as importe
            from whatsapp_propuestas w
            left join poliza_recibos r on r.id = w.recibo_id and r.correduria_id = ${correduriaId}::uuid
            left join polizas p on p.id = r.poliza_id and p.correduria_id = ${correduriaId}::uuid
            left join oportunidades o on o.id = w.oportunidad_id and o.correduria_id = ${correduriaId}::uuid
           where w.correduria_id = ${correduriaId}::uuid and w.id::text = any(${ids}::text[])`)
      : []
    const resumen: ResumenPropuesta[] = filas.map((f) => ({ ...f, importe: f.importe !== null && /^-?\d+(\.\d{1,2})?$/.test(f.importe.trim()) ? eur(Number(f.importe)) : null }))
    const quien = a.nombrePila ? escapeHtml(a.nombrePila) : 'Un cliente'
    const lineas = [
      `💬 <b>WhatsApp</b> · ${quien} — <a href="${enlaceFichaCliente(a.clienteId)}">ficha</a>`,
      ...a.hechos.map((h) => `· ${escapeHtml(h)}`),
      ...resumen.map((r, i) => `${i + 1}. ${escapeHtml(lineaPropuesta(r.tipo, r))}`),
    ]
    const botones = resumen.map((r, i) => botonesPropuesta(r.id, resumen.length > 1 ? String(i + 1) : undefined))
    const msg = await tgSendButtons(lineas.join('\n'), botones)
    if (msg === null) return 'sin_telegram'
    if (ids.length) {
      await db.$executeRaw(Prisma.sql`
        update whatsapp_propuestas set telegram_message_id = ${msg}
         where correduria_id = ${correduriaId}::uuid and id::text = any(${ids}::text[])`)
    }
    return 'avisado'
  } catch (e) {
    console.error('[whatsapp-ia] aviso de Telegram:', e instanceof Error ? e.name : 'error')
    return 'error'
  }
}

export type ResolucionPropuesta =
  | { ok: true; estado: 'aplicada' | 'descartada'; tipo: TipoPropuesta; resultado: Record<string, unknown> }
  | { ok: false; estado: 'no_encontrada' | 'ya_resuelta' | 'caducada' | 'sin_ancla' | 'fallo_al_aplicar' | 'sin_migracion'; status: number; motivo?: string }

type FilaPropuesta = {
  id: string; tipo: TipoPropuesta; estado: string; caduca_at: Date; cliente_id: string
  recibo_id: string | null; oportunidad_id: string | null; fecha: string | null
}

/**
 * Aplica o descarta una propuesta. Atómico frente a dobles pulsaciones (UPDATE condicionado). Si aplicar falla, la
 * propuesta VUELVE a `pendiente` (con el error en `resultado`) para poder reintentarla; nada queda a medias dentro de
 * cada efecto (cada uno es una transacción).
 */
export async function resolverPropuesta(correduriaId: string, id: string, decision: Decision, actor: string, ahora: Date = new Date()): Promise<ResolucionPropuesta> {
  const db = prismaAsegura()
  const nuevo = decision === 'aplicar' ? 'aplicada' : 'descartada'
  let reclamada: FilaPropuesta | undefined
  try {
    ;[reclamada] = await db.$queryRaw<FilaPropuesta[]>(Prisma.sql`
      update whatsapp_propuestas set estado = ${nuevo}, resuelta_at = now(), resuelta_por = ${actor.slice(0, 120)}
       where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'
         and (${decision} = 'descartar' or caduca_at > ${ahora})
      returning id::text as id, tipo, estado, caduca_at, cliente_id::text as cliente_id, recibo_id::text as recibo_id,
                oportunidad_id::text as oportunidad_id, payload->>'fecha' as fecha`)
  } catch (e) {
    if (faltaMigracion(e)) return { ok: false, estado: 'sin_migracion', status: 503 }
    throw e
  }
  if (!reclamada) {
    const [actual] = await db.$queryRaw<{ estado: string; caduca_at: Date }[]>(Prisma.sql`
      select estado, caduca_at from whatsapp_propuestas where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!actual) return { ok: false, estado: 'no_encontrada', status: 404 }
    const v = puedeResolver({ estado: actual.estado as 'pendiente', caducaAt: actual.caduca_at }, decision, ahora)
    if (!v.ok && v.estado === 'caducada') {
      await db.$executeRaw(Prisma.sql`
        update whatsapp_propuestas set estado = 'caducada', resuelta_at = now(), resuelta_por = 'sistema:caducidad'
         where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`)
      return { ok: false, estado: 'caducada', status: 410 }
    }
    return { ok: false, estado: 'ya_resuelta', status: 409, motivo: actual.estado }
  }
  if (decision === 'descartar') {
    await historial(correduriaId, reclamada.cliente_id, `Propuesta de WhatsApp (${reclamada.tipo}) descartada — por ${actor}`).catch(() => {})
    return { ok: true, estado: 'descartada', tipo: reclamada.tipo, resultado: {} }
  }

  let resultado: Record<string, unknown>
  try {
    const r = await aplicar(correduriaId, reclamada, actor, ahora)
    if (!r.ok) {
      await devolverAPendiente(correduriaId, id, { error: r.motivo })
      return { ok: false, estado: r.motivo === 'sin_ancla' ? 'sin_ancla' : 'fallo_al_aplicar', status: r.status, motivo: r.motivo }
    }
    resultado = r.resultado
  } catch (e) {
    console.error('[whatsapp-ia] aplicar propuesta:', e instanceof Error ? e.name : 'error')
    await devolverAPendiente(correduriaId, id, { error: faltaMigracion(e) ? 'sin_migracion' : 'excepcion' }).catch(() => {})
    return { ok: false, estado: faltaMigracion(e) ? 'sin_migracion' : 'fallo_al_aplicar', status: faltaMigracion(e) ? 503 : 500 }
  }
  await db.$executeRaw(Prisma.sql`
    update whatsapp_propuestas set resultado = ${JSON.stringify(resultado)}::jsonb
     where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
  return { ok: true, estado: 'aplicada', tipo: reclamada.tipo, resultado }
}

async function devolverAPendiente(correduriaId: string, id: string, resultado: Record<string, unknown>): Promise<void> {
  await prismaAsegura().$executeRaw(Prisma.sql`
    update whatsapp_propuestas set estado = 'pendiente', resuelta_at = null, resuelta_por = null, resultado = ${JSON.stringify(resultado)}::jsonb
     where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'aplicada'`)
}

function historial(correduriaId: string, clienteId: string, texto: string) {
  return prismaAsegura().$executeRaw(Prisma.sql`
    insert into historial_interno (correduria_id, cliente_id, tipo, texto)
    values (${correduriaId}::uuid, ${clienteId}::uuid, cast('contacto' as tipo_historial_interno), ${texto.slice(0, 2000)})`)
}

type Aplicado = { ok: true; resultado: Record<string, unknown> } | { ok: false; motivo: string; status: number }

async function aplicar(correduriaId: string, p: FilaPropuesta, actor: string, ahora: Date): Promise<Aplicado> {
  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  if (p.tipo === 'vencimiento') {
    if (!p.oportunidad_id || !p.fecha) return { ok: false, motivo: 'sin_ancla', status: 409 }
    // La MISMA escritura que `EditarVencimiento` de plataforma: pisa el vencimiento y reprograma la llamada.
    const r = await editarOportunidad(correduriaId, p.oportunidad_id, { fechaFinVigencia: p.fecha }, actor, { reprogramar: true, hoy: ahora })
    if (!r.ok) return { ok: false, motivo: r.estado, status: r.status }
    return { ok: true, resultado: { oportunidadId: p.oportunidad_id, tarea: r.tarea } }
  }
  if (!p.recibo_id) return { ok: false, motivo: 'sin_ancla', status: 409 }
  const tarea = tareaAlAplicar(p.tipo, p.fecha, hoy)
  if (!tarea) return { ok: false, motivo: 'invalida', status: 422 }
  const reciboId = p.recibo_id
  return prismaAsegura().$transaction(async (tx) => {
    // El recibo, de esta correduría y de una póliza de ESTA ficha (nunca otro).
    const [rec] = await tx.$queryRaw<{ poliza_id: string; ramo: string }[]>(Prisma.sql`
      select r.poliza_id::text as poliza_id, p.tipo::text as ramo from poliza_recibos r join polizas p on p.id = r.poliza_id
       where r.id = ${reciboId}::uuid and r.correduria_id = ${correduriaId}::uuid and p.correduria_id = ${correduriaId}::uuid
         and p.cliente_id = ${p.cliente_id}::uuid`)
    if (!rec) return { ok: false as const, motivo: 'recibo_no_encontrado', status: 404 }
    if (p.tipo === 'fecha_cobro') {
      // SOLO la fecha prometida: la situación del recibo la manda CIMA/la compañía.
      await tx.$executeRaw(Prisma.sql`
        update poliza_recibos set fecha_prometida_pago = ${p.fecha}::date, updated_at = now()
         where id = ${reciboId}::uuid and correduria_id = ${correduriaId}::uuid`)
    }
    const [g] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, origen_trigger)
      values (${correduriaId}::uuid, cast('tarea' as gestion_tipo), cast('alta' as gestion_prioridad), 'pendiente', ${tarea.descripcion},
              (${tarea.fechaLimite}::date + time '23:59:59') at time zone 'Europe/Madrid', ${p.cliente_id}::uuid, ${rec.poliza_id}::uuid, ${ORIGEN_TAREA_IA})
      returning id::text as id`)
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${p.cliente_id}::uuid, cast('contacto' as tipo_historial_interno),
              ${`WhatsApp: ${p.tipo === 'fecha_cobro' ? `promete pagar el recibo de ${rec.ramo} el ${p.fecha}` : `dice que ya pagó el recibo de ${rec.ramo}`} (aplicado por ${actor})`.slice(0, 2000)})`)
    return { ok: true as const, resultado: { reciboId, tareaId: g.id, ...(p.tipo === 'fecha_cobro' ? { fechaPrometida: p.fecha } : {}) } }
  })
}
