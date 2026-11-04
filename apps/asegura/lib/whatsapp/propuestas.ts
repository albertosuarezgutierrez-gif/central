// Propuestas de la IA de WhatsApp: crear (desde el analizador), avisar por Telegram y RESOLVER (aplicar/descartar).
// Las reglas son PURAS en `propuestas-reglas.ts`. Resolver lo invoca `POST /api/operador/whatsapp/propuesta`, que llama
// el handler del callback `wap_` de plataforma (parte B). Un solo uso: la fila se RECLAMA con un UPDATE condicionado
// (`estado = 'pendiente'`), así dos pulsaciones a la vez aplican una vez y la otra recibe 409.
//
// 🚫 Aquí no hay ni puede haber `resolverDevolucion` (cerrar una devolución es el botón «cobrado de nuevo» de una persona):
//    lo vigila el cepo de `propuestas.test.ts`. La situación de un recibo NUNCA se toca; solo `fecha_prometida_pago`.
// 🛡️ Toda sentencia filtra `correduria_id`.
// Aprendizaje (spec § «Aprendizaje y autonomía»): ✏️ Modificar aplica la versión corregida; toda resolución queda en
// `whatsapp_aprendizaje`; con ASEGURA_WHATSAPP_AUTONOMIA_ACTIVA=1 y racha ≥ umbral un TIPO se aplica solo
// (`aplicarSiAutonoma`) con ↩️ Deshacer (`deshacerPropuesta`, un uso, vuelve al valor previo guardado).

import { tgSendButtons, escapeHtml } from '@central/core-telegram'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { esColumnaAusente, esTablaAusente } from '../pg-error'
import { editarOportunidad } from '../oportunidad-seguimiento'
import { enlaceFichaCliente } from '../datos-cotizados'
import { eur } from '../dinero'
import { ORIGEN_TAREA_IA } from './ejecutor'
import { decryptField } from '@central/module-seguros-pii'
import { botonDeshacer, botonesPropuesta, cerrarSiFallaDevolver, fechaAlAplicar, lineaPropuesta, payloadPropuesta, planRevertir, puedeDeshacer, puedeResolver, registroTrasDeshacer, tareaAlAplicar, tareaSeguimientoDe, type Decision, type EstadoParaRevertir, type TipoPropuesta } from './propuestas-reglas'
import { ACTOR_AUTONOMO, ENV_AUTONOMIA, ENV_UMBRAL, autonomiaActiva, decidirAutonomia, leerCorreccion, observacionParaAprendizaje, type Resolucion } from './aprendizaje-reglas'
import { rachaDe, registrarContexto, registrarDeshecha, registrarIntentoDeshacer, registrarResolucion } from './aprendizaje'

const faltaMigracion = (e: unknown) => esTablaAusente(e) || esColumnaAusente(e)

export type NuevaPropuesta = {
  clienteId: string
  conversacionId: string
  tipo: TipoPropuesta
  reciboId: string | null
  oportunidadId: string | null
  fecha: string | null
}

export type PropuestaCreada =
  | { ok: true; id: string }
  | { ok: false; motivo: 'ya_pendiente' | 'fuera_de_correduria' | 'sin_migracion' | 'sin_ancla' | 'invalida' }

/** Contexto SIN PII para el registro de aprendizaje (extracto ya redactado). */
export type ContextoAprendizaje = { origenSaliente: string | null; extracto: string | null }

export async function crearPropuesta(correduriaId: string, p: NuevaPropuesta, contexto?: ContextoAprendizaje): Promise<PropuestaCreada> {
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
    if (!fila) {
      // El insert no entra por dos razones distintas: ya hay una pendiente del mismo (tipo, ancla) — la clave de
      // `uq_wa_propuesta_pendiente` — o el cliente/ancla no es de esta correduría (el `where exists`). Se distingue.
      const [pendiente] = await prismaAsegura().$queryRaw<{ id: string }[]>(Prisma.sql`
        select id::text as id from whatsapp_propuestas
         where correduria_id = ${correduriaId}::uuid and tipo = ${p.tipo}
           and coalesce(recibo_id, oportunidad_id) = coalesce(${p.reciboId}::uuid, ${p.oportunidadId}::uuid)
           and estado = 'pendiente'
         limit 1`)
      return { ok: false, motivo: pendiente ? 'ya_pendiente' : 'fuera_de_correduria' }
    }
    if (contexto) {
      await registrarContexto(correduriaId, {
        propuestaId: fila.id, conversacionId: p.conversacionId, tipo: p.tipo, origenSaliente: contexto.origenSaliente, extracto: contexto.extracto,
        propuesto: payload,
      })
    }
    return { ok: true, id: fila.id }
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
  a: { clienteId: string; nombrePila: string | null; hechos: string[]; propuestas: { id: string; autonoma?: boolean }[] },
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
    // Las aplicadas SOLAS (modo autónomo) se dicen como tales y solo llevan ↩️ Deshacer.
    const solas = new Set(a.propuestas.filter((p) => p.autonoma).map((p) => p.id))
    const lineas = [
      `💬 <b>WhatsApp</b> · ${quien} — <a href="${enlaceFichaCliente(a.clienteId)}">ficha</a>`,
      ...a.hechos.map((h) => `· ${escapeHtml(h)}`),
      ...resumen.map((r, i) => `${i + 1}. ${solas.has(r.id) ? '🤖 <b>Aplicada sola:</b> ' : ''}${escapeHtml(lineaPropuesta(r.tipo, r))}`),
    ]
    const etiqueta = (i: number) => (resumen.length > 1 ? String(i + 1) : undefined)
    const botones = resumen.map((r, i) => (solas.has(r.id) ? botonDeshacer(r.id, etiqueta(i)) : botonesPropuesta(r.id, etiqueta(i))))
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
  | { ok: true; estado: 'aplicada' | 'descartada' | 'modificada'; tipo: TipoPropuesta; resultado: Record<string, unknown> }
  | {
      ok: false
      estado: 'no_encontrada' | 'ya_resuelta' | 'caducada' | 'sin_ancla' | 'fallo_al_aplicar' | 'sin_migracion' | 'correccion_invalida'
      status: number
      motivo?: string
    }

type FilaPropuesta = {
  id: string; tipo: TipoPropuesta; estado: string; caduca_at: Date; cliente_id: string
  recibo_id: string | null; oportunidad_id: string | null; fecha: string | null; fecha_original: string | null
}

export type OpcionesResolver = {
  /** ✏️: el texto de Alberto (fecha y/o observación). Solo con `decision = 'modificar'`. */
  correccion?: string
  /** Aplicada SOLA por el modo autónomo (`aplicarSiAutonoma`): guarda la marca para ↩️ Deshacer. */
  autonoma?: boolean
}

/**
 * Aplica, modifica (✏️: aplica la versión corregida) o descarta una propuesta. Atómico frente a dobles pulsaciones (UPDATE
 * condicionado). Si aplicar falla, la propuesta VUELVE a `pendiente` (con el error en `resultado`) para poder reintentarla;
 * nada queda a medias dentro de cada efecto (cada uno es una transacción). Toda resolución queda en el registro de
 * aprendizaje (best effort: sin la tabla, no-op).
 */
export async function resolverPropuesta(
  correduriaId: string,
  id: string,
  decision: Decision | 'modificar',
  actor: string,
  ahora: Date = new Date(),
  opciones: OpcionesResolver = {},
): Promise<ResolucionPropuesta> {
  const db = prismaAsegura()
  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const nuevo = decision === 'descartar' ? 'descartada' : 'aplicada'
  const autonoma = decision === 'aplicar' && opciones.autonoma === true

  // ✏️: la corrección se interpreta ANTES de reclamar (depende del tipo); inválida → nada cambia.
  let nuevaFecha: string | null = null
  let observacion: string | null = null
  if (decision === 'modificar') {
    let actual: { tipo: TipoPropuesta } | undefined
    try {
      ;[actual] = await db.$queryRaw<{ tipo: TipoPropuesta }[]>(Prisma.sql`
        select tipo from whatsapp_propuestas where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
    } catch (e) {
      if (faltaMigracion(e)) return { ok: false, estado: 'sin_migracion', status: 503 }
      throw e
    }
    if (!actual) return { ok: false, estado: 'no_encontrada', status: 404 }
    const c = leerCorreccion(opciones.correccion ?? '', actual.tipo, hoy)
    if (!c) return { ok: false, estado: 'correccion_invalida', status: 422, motivo: 'una fecha válida (dd/mm/aaaa) y/o una observación' }
    nuevaFecha = c.fecha
    observacion = c.observacion
  }

  // Se reclama SIN tocar el `payload`: la fecha corregida por ✏️ solo se persiste tras aplicar con éxito (si aplicar
  // falla, la propuesta vuelve a pendiente con el payload ORIGINAL).
  let reclamada: FilaPropuesta | undefined
  try {
    ;[reclamada] = await db.$queryRaw<FilaPropuesta[]>(Prisma.sql`
      update whatsapp_propuestas set estado = ${nuevo}, resuelta_at = now(), resuelta_por = ${actor.slice(0, 120)}
       where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'
         and (${decision} = 'descartar' or caduca_at > ${ahora})
      returning id::text as id, tipo, estado, caduca_at, cliente_id::text as cliente_id, recibo_id::text as recibo_id,
                oportunidad_id::text as oportunidad_id, payload->>'fecha' as fecha, payload->>'fecha' as fecha_original`)
  } catch (e) {
    if (faltaMigracion(e)) return { ok: false, estado: 'sin_migracion', status: 503 }
    throw e
  }
  if (!reclamada) {
    const [actual] = await db.$queryRaw<{ estado: string; caduca_at: Date }[]>(Prisma.sql`
      select estado, caduca_at from whatsapp_propuestas where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!actual) return { ok: false, estado: 'no_encontrada', status: 404 }
    const v = puedeResolver({ estado: actual.estado as 'pendiente', caducaAt: actual.caduca_at }, decision === 'descartar' ? 'descartar' : 'aplicar', ahora)
    if (!v.ok && v.estado === 'caducada') {
      await db.$executeRaw(Prisma.sql`
        update whatsapp_propuestas set estado = 'caducada', resuelta_at = now(), resuelta_por = 'sistema:caducidad'
         where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`)
      return { ok: false, estado: 'caducada', status: 410 }
    }
    return { ok: false, estado: 'ya_resuelta', status: 409, motivo: actual.estado }
  }
  const propuesto = reclamada.fecha_original ? { fecha: reclamada.fecha_original } : {}
  // La observación de ✏️ va al aprendizaje (y de ahí al prompt) REDACTADA, también del nombre del cliente.
  const observacionAprendida = observacion ? observacionParaAprendizaje(observacion, await nombresDe(correduriaId, id)) : null
  const aprender = (resolucion: Resolucion, final: { fecha?: string } | null) =>
    registrarResolucion(correduriaId, {
      propuestaId: id, tipo: reclamada!.tipo, resolucion, autonoma, actor, propuesto, final, observacion: observacionAprendida,
    })

  if (decision === 'descartar') {
    await historial(correduriaId, reclamada.cliente_id, `Propuesta de WhatsApp (${reclamada.tipo}) descartada — por ${actor}`).catch(() => {})
    await aprender('descartada', null)
    return { ok: true, estado: 'descartada', tipo: reclamada.tipo, resultado: {} }
  }

  // Lo que se APLICA: con la fecha corregida por ✏️ (todavía no escrita en el payload).
  const efectiva: FilaPropuesta = { ...reclamada, fecha: fechaAlAplicar(reclamada.tipo, reclamada.fecha_original, nuevaFecha) }
  let resultado: Record<string, unknown>
  try {
    const r = await aplicar(correduriaId, efectiva, actor, ahora, observacion)
    if (!r.ok) {
      await cerrarSinEfecto(correduriaId, id, { error: r.motivo })
      return { ok: false, estado: r.motivo === 'sin_ancla' ? 'sin_ancla' : 'fallo_al_aplicar', status: r.status, motivo: r.motivo }
    }
    resultado = r.resultado
  } catch (e) {
    console.error('[whatsapp-ia] aplicar propuesta:', e instanceof Error ? e.name : 'error')
    await cerrarSinEfecto(correduriaId, id, { error: faltaMigracion(e) ? 'sin_migracion' : 'excepcion' }).catch(() => {})
    return { ok: false, estado: faltaMigracion(e) ? 'sin_migracion' : 'fallo_al_aplicar', status: faltaMigracion(e) ? 503 : 500 }
  }
  if (autonoma) resultado = { ...resultado, autonoma: true }
  if (decision === 'modificar') resultado = { ...resultado, modificada: { fechaOriginal: reclamada.fecha_original, fechaFinal: efectiva.fecha, conObservacion: observacion !== null } }
  // Aplicada con éxito: AHORA se persiste la fecha con la que se aplicó (la corregida por ✏️, si la hubo).
  await db.$executeRaw(Prisma.sql`
    update whatsapp_propuestas set resultado = ${JSON.stringify(resultado)}::jsonb,
           payload = case when ${efectiva.fecha}::text is not null and tipo <> 'pagado'
                          then jsonb_set(payload, '{fecha}', to_jsonb(${efectiva.fecha}::text)) else payload end
     where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
  await aprender(decision === 'modificar' ? 'modificada' : 'aplicada', efectiva.fecha ? { fecha: efectiva.fecha } : {})
  return { ok: true, estado: decision === 'modificar' ? 'modificada' : 'aplicada', tipo: reclamada.tipo, resultado }
}

/**
 * Modo AUTÓNOMO (spec § «Aprendizaje y autonomía»): si el flag global está encendido y ESE tipo lleva una racha de
 * aprobadas seguidas ≥ umbral, la propuesta se aplica sola (actor `agente:whatsapp-ia-autonomo`) y el aviso lleva
 * ↩️ Deshacer. Cualquier puerta cerrada o fallo → `false` y queda pendiente con sus botones, como siempre.
 * Solo los tres tipos de propuesta (cartera propia, reversible): nada de bots, tarificación ni envíos a terceros.
 */
export async function aplicarSiAutonoma(correduriaId: string, id: string, ahora: Date = new Date()): Promise<boolean> {
  try {
    // El flag primero: apagado, ni siquiera se lee nada.
    if (!autonomiaActiva(process.env[ENV_AUTONOMIA])) return false
    const [p] = await prismaAsegura().$queryRaw<{ tipo: TipoPropuesta }[]>(Prisma.sql`
      select tipo from whatsapp_propuestas where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`)
    if (!p) return false
    const racha = await rachaDe(correduriaId, p.tipo)
    const v = decidirAutonomia({ flag: process.env[ENV_AUTONOMIA], umbral: process.env[ENV_UMBRAL], tipo: p.tipo, racha })
    if (!v.autonoma) return false
    const r = await resolverPropuesta(correduriaId, id, 'aplicar', ACTOR_AUTONOMO, ahora, { autonoma: true })
    return r.ok
  } catch (e) {
    // Sin la migración no es un fallo del modo autónomo: queda pendiente, como siempre, y no se ensucia el log.
    if (!faltaMigracion(e)) console.error('[whatsapp-ia] modo autónomo:', e instanceof Error ? e.name : 'error')
    return false
  }
}

export type ResultadoDeshacer =
  | { ok: true; estado: 'deshecha'; tipo: TipoPropuesta }
  | { ok: false; estado: 'no_encontrada' | 'no_autonoma' | 'ya_deshecha' | 'sin_previo' | 'cambiado_despues' | 'fallo_al_deshacer' | 'sin_migracion'; status: number }

type FilaDeshacer = {
  tipo: TipoPropuesta; cliente_id: string; recibo_id: string | null; oportunidad_id: string | null; fecha: string | null
  resultado: Record<string, unknown>
}

/**
 * ↩️ Deshacer una propuesta aplicada SOLA: vuelve al valor previo GUARDADO al aplicarla. Un uso (la marca `deshecha_at`
 * se reclama con un UPDATE condicionado); si alguien cambió el dato después, no se pisa (409 `cambiado_despues`).
 * Si revertir falla, la marca se quita para poder reintentar. Siempre reinicia la racha de ese tipo.
 */
export async function deshacerPropuesta(correduriaId: string, id: string, actor: string, _ahora: Date = new Date()): Promise<ResultadoDeshacer> {
  const db = prismaAsegura()
  let fila: FilaDeshacer | undefined
  try {
    ;[fila] = await db.$queryRaw<FilaDeshacer[]>(Prisma.sql`
      update whatsapp_propuestas
         set resultado = resultado || jsonb_build_object('deshecha_at', now(), 'deshecha_por', ${actor.slice(0, 120)}::text)
       where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'aplicada'
         and resultado is not null and resultado->'autonoma' = 'true'::jsonb and not (resultado ? 'deshecha_at')
         and jsonb_typeof(resultado->'previo') = 'object'
      returning tipo, cliente_id::text as cliente_id, recibo_id::text as recibo_id, oportunidad_id::text as oportunidad_id,
                payload->>'fecha' as fecha, resultado`)
  } catch (e) {
    if (faltaMigracion(e)) return { ok: false, estado: 'sin_migracion', status: 503 }
    throw e
  }
  if (!fila) {
    const [actual] = await db.$queryRaw<{ estado: string; resultado: Record<string, unknown> | null }[]>(Prisma.sql`
      select estado, resultado from whatsapp_propuestas where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!actual) return { ok: false, estado: 'no_encontrada', status: 404 }
    const v = puedeDeshacer(actual)
    return v.ok ? { ok: false, estado: 'ya_deshecha', status: 409 } : { ok: false, estado: v.estado, status: v.status }
  }
  const soltar = () =>
    db.$executeRaw(Prisma.sql`
      update whatsapp_propuestas set resultado = resultado - 'deshecha_at' - 'deshecha_por'
       where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`).catch(() => 0)
  let r: 'ok' | 'cambiado_despues' | 'fallo_al_deshacer'
  try {
    r = await revertir(correduriaId, fila, actor)
  } catch (e) {
    console.error('[whatsapp-ia] deshacer propuesta:', e instanceof Error ? e.name : 'error')
    r = 'fallo_al_deshacer'
  }
  // Pulsar ↩️ ya es la señal: la racha de ese tipo se corta SIEMPRE. Pero solo un deshacer HECHO queda como «deshecha»;
  // si no se pudo revertir (cambiado después, fallo) queda como intento fallido.
  if (registroTrasDeshacer(r) === 'deshecha') await registrarDeshecha(correduriaId, id, actor)
  else await registrarIntentoDeshacer(correduriaId, id, actor, r)
  if (r !== 'ok') {
    await soltar()
    return { ok: false, estado: r, status: r === 'cambiado_despues' ? 409 : 500 }
  }
  return { ok: true, estado: 'deshecha', tipo: fila.tipo }
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/**
 * Revierte en UNA transacción: bloquea (`for update`) lo que escribió aplicar, comprueba que sigue como lo dejó
 * (`planRevertir`: si no, `cambiado_despues` y nada cambia) y lo devuelve al previo. Sin hueco entre comprobar y
 * escribir (sin TOCTOU). Un vencimiento NO pasa por `editarOportunidad` (abriría otra transacción y reprogramaría
 * de nuevo): vuelve la fecha y deshace exactamente la tarea de seguimiento que aplicar creó o movió.
 */
async function revertir(correduriaId: string, p: FilaDeshacer, actor: string): Promise<'ok' | 'cambiado_despues' | 'fallo_al_deshacer'> {
  const previo = (p.resultado.previo ?? {}) as Record<string, unknown>
  const tareaIaId = p.tipo === 'vencimiento' ? null : texto(p.resultado.tareaId)
  const tareaSeg = p.tipo === 'vencimiento' ? tareaSeguimientoDe(previo) : null
  return prismaAsegura().$transaction(async (tx) => {
    const actual: EstadoParaRevertir = {}
    if (p.tipo === 'vencimiento') {
      if (!p.oportunidad_id) return 'fallo_al_deshacer' as const
      const [o] = await tx.$queryRaw<{ fecha: string | null; estado: string }[]>(Prisma.sql`
        select to_char(fecha_fin_vigencia, 'YYYY-MM-DD') as fecha, estado::text as estado from oportunidades
         where id = ${p.oportunidad_id}::uuid and correduria_id = ${correduriaId}::uuid for update`)
      actual.oportunidad = o ?? null
      if (tareaSeg) {
        const [t] = await tx.$queryRaw<{ fecha: string | null; estado: string }[]>(Prisma.sql`
          select to_char(fecha_limite at time zone 'Europe/Madrid', 'YYYY-MM-DD') as fecha, estado::text as estado from gestiones
           where id = ${tareaSeg.id}::uuid and correduria_id = ${correduriaId}::uuid and oportunidad_id = ${p.oportunidad_id}::uuid
             and origen_trigger = 'central:seguimiento'
           for update`)
        actual.tareaSeguimiento = t ?? null
      }
    } else if (p.tipo === 'fecha_cobro') {
      if (!p.recibo_id) return 'fallo_al_deshacer' as const
      const [r] = await tx.$queryRaw<{ prometida: string | null }[]>(Prisma.sql`
        select to_char(fecha_prometida_pago, 'YYYY-MM-DD') as prometida from poliza_recibos
         where id = ${p.recibo_id}::uuid and correduria_id = ${correduriaId}::uuid for update`)
      actual.recibo = r ?? null
    }
    const plan = planRevertir({ tipo: p.tipo, aplicada: p.fecha, previo, tareaIaId, actual })
    if (!plan.ok) return plan.estado
    const nota = `\n— Deshecha (propuesta de WhatsApp aplicada sola) por ${actor}`
    for (const paso of plan.pasos) {
      if (paso.paso === 'vencimiento') {
        await tx.$executeRaw(Prisma.sql`
          update oportunidades set fecha_fin_vigencia = ${paso.fecha}::date, updated_at = now()
           where id = ${p.oportunidad_id}::uuid and correduria_id = ${correduriaId}::uuid`)
        await tx.$executeRaw(Prisma.sql`
          insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
          values (${correduriaId}::uuid, ${p.oportunidad_id}::uuid, 'editada', cast(${actual.oportunidad!.estado} as estado_comercial),
                  cast(${actual.oportunidad!.estado} as estado_comercial),
                  ${JSON.stringify({ fechaFinVigencia: { antes: p.fecha, despues: paso.fecha }, deshecho: 'whatsapp_autonoma' })}::jsonb, ${actor})`)
      } else if (paso.paso === 'prometida') {
        await tx.$executeRaw(Prisma.sql`
          update poliza_recibos set fecha_prometida_pago = ${paso.fecha}::date, updated_at = now()
           where id = ${p.recibo_id}::uuid and correduria_id = ${correduriaId}::uuid`)
      } else if (paso.paso === 'cerrar_tarea_ia') {
        await tx.$executeRaw(Prisma.sql`
          update gestiones set estado = 'cerrada', observaciones = coalesce(observaciones, '') || ${nota}, updated_at = now()
           where id = ${paso.id}::uuid and correduria_id = ${correduriaId}::uuid and origen_trigger = ${ORIGEN_TAREA_IA}
             and estado::text in ('pendiente', 'en_curso')`)
      } else if (paso.paso === 'cerrar_tarea_seguimiento') {
        await tx.$executeRaw(Prisma.sql`
          update gestiones set estado = 'cerrada', observaciones = coalesce(observaciones, '') || ${nota}, updated_at = now()
           where id = ${paso.id}::uuid and correduria_id = ${correduriaId}::uuid and origen_trigger = 'central:seguimiento'
             and estado::text <> 'cerrada'`)
      } else {
        await tx.$executeRaw(Prisma.sql`
          update gestiones set fecha_limite = (${paso.fecha}::date + time '23:59:59') at time zone 'Europe/Madrid', updated_at = now()
           where id = ${paso.id}::uuid and correduria_id = ${correduriaId}::uuid and origen_trigger = 'central:seguimiento'
             and estado::text <> 'cerrada'`)
      }
    }
    const que = p.tipo === 'vencimiento' ? `el vencimiento (vuelve a ${texto(previo.fechaFinVigencia) ?? 'sin fecha'})` : `la propuesta «${p.tipo}»`
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${p.cliente_id}::uuid, cast('contacto' as tipo_historial_interno),
              ${`WhatsApp: deshecho ${que} aplicado solo — por ${actor}`.slice(0, 2000)})`)
    return 'ok' as const
  })
}

/**
 * Nombres con los que redactar la observación de ✏️ (nombre y apellidos de la ficha y el perfil de WhatsApp de la
 * conversación). `null` = no se pudieron leer: la observación no se guarda (estado conservador).
 */
async function nombresDe(correduriaId: string, propuestaId: string): Promise<(string | null)[] | null> {
  try {
    const [f] = await prismaAsegura().$queryRaw<{ nombre: string | null; apellidos: string | null; perfil: string | null }[]>(Prisma.sql`
      select c.nombre, c.apellidos, v.wa_perfil_nombre_cifrado as perfil
        from whatsapp_propuestas w
        join clientes c on c.id = w.cliente_id and c.correduria_id = ${correduriaId}::uuid
        left join conversaciones v on v.id = w.conversacion_id and v.correduria_id = ${correduriaId}::uuid
       where w.id = ${propuestaId}::uuid and w.correduria_id = ${correduriaId}::uuid`)
    if (!f) return null
    let perfil: string | null = null
    if (f.perfil) {
      if (!f.perfil.startsWith('v1:')) perfil = f.perfil
      else {
        try {
          perfil = decryptField(f.perfil)
        } catch {
          return null
        }
      }
    }
    return [f.nombre, f.apellidos, perfil]
  } catch {
    return null
  }
}

/**
 * Aplicar falló: la propuesta vuelve a `pendiente` para reintentarla. Si ESO falla también (p. ej. choca con
 * `uq_wa_propuesta_pendiente`: ya hay otra pendiente del mismo asunto), se marca `descartada` con el error en
 * `resultado`; NUNCA se deja `aplicada` sin efecto.
 */
async function cerrarSinEfecto(correduriaId: string, id: string, resultado: Record<string, unknown>): Promise<void> {
  await cerrarSiFallaDevolver(
    () => devolverAPendiente(correduriaId, id, resultado),
    () =>
      prismaAsegura().$executeRaw(Prisma.sql`
        update whatsapp_propuestas set estado = 'descartada', resuelta_por = 'sistema:fallo_al_aplicar',
               resultado = ${JSON.stringify({ ...resultado, devolver_a_pendiente: 'fallo' })}::jsonb
         where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'aplicada'`).then(() => undefined),
  )
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

/**
 * Los efectos. Guarda en `resultado.previo` el valor que había ANTES (para ↩️ Deshacer de una autónoma) y, si viene,
 * la observación de ✏️ en la nota y en la tarea.
 */
async function aplicar(correduriaId: string, p: FilaPropuesta, actor: string, ahora: Date, observacion: string | null): Promise<Aplicado> {
  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const nota = observacion ? ` — nota del corredor: ${observacion}` : ''
  if (p.tipo === 'vencimiento') {
    if (!p.oportunidad_id || !p.fecha) return { ok: false, motivo: 'sin_ancla', status: 409 }
    const [antes] = await prismaAsegura().$queryRaw<{ fecha: string | null }[]>(Prisma.sql`
      select to_char(fecha_fin_vigencia, 'YYYY-MM-DD') as fecha from oportunidades
       where id = ${p.oportunidad_id}::uuid and correduria_id = ${correduriaId}::uuid`)
    // La MISMA escritura que `EditarVencimiento` de plataforma: pisa el vencimiento y reprograma la llamada.
    const r = await editarOportunidad(correduriaId, p.oportunidad_id, { fechaFinVigencia: p.fecha }, actor, { reprogramar: true, hoy: ahora })
    if (!r.ok) return { ok: false, motivo: r.estado, status: r.status }
    if (nota) await historial(correduriaId, p.cliente_id, `WhatsApp: vencimiento ${p.fecha}${nota} (aplicado por ${actor})`).catch(() => {})
    // ↩️ necesita saber QUÉ tarea de seguimiento tocó (creada o movida, y desde qué fecha) para deshacerlo exacto.
    const tareaSeguimiento = r.tarea ? { id: r.tarea.tareaId, accion: r.tarea.accion, fecha: r.tarea.fecha, desde: r.tarea.desde } : null
    return {
      ok: true,
      resultado: {
        oportunidadId: p.oportunidad_id, tarea: r.tarea ? { accion: r.tarea.accion, fecha: r.tarea.fecha } : null,
        previo: { fechaFinVigencia: antes?.fecha ?? null, tareaSeguimiento },
      },
    }
  }
  if (!p.recibo_id) return { ok: false, motivo: 'sin_ancla', status: 409 }
  const tareaBase = tareaAlAplicar(p.tipo, p.fecha, hoy)
  if (!tareaBase) return { ok: false, motivo: 'invalida', status: 422 }
  const tarea = { ...tareaBase, descripcion: `${tareaBase.descripcion}${nota}`.slice(0, 2000) }
  const reciboId = p.recibo_id
  return prismaAsegura().$transaction(async (tx) => {
    // El recibo, de esta correduría y de una póliza de ESTA ficha (nunca otro). `for update`: el previo es el de verdad.
    const [rec] = await tx.$queryRaw<{ poliza_id: string; ramo: string; prometida: string | null }[]>(Prisma.sql`
      select r.poliza_id::text as poliza_id, p.tipo::text as ramo, to_char(r.fecha_prometida_pago, 'YYYY-MM-DD') as prometida
        from poliza_recibos r join polizas p on p.id = r.poliza_id
       where r.id = ${reciboId}::uuid and r.correduria_id = ${correduriaId}::uuid and p.correduria_id = ${correduriaId}::uuid
         and p.cliente_id = ${p.cliente_id}::uuid
       for update of r`)
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
              ${`WhatsApp: ${p.tipo === 'fecha_cobro' ? `promete pagar el recibo de ${rec.ramo} el ${p.fecha}` : `dice que ya pagó el recibo de ${rec.ramo}`}${nota} (aplicado por ${actor})`.slice(0, 2000)})`)
    return {
      ok: true as const,
      resultado: {
        reciboId, tareaId: g.id, ...(p.tipo === 'fecha_cobro' ? { fechaPrometida: p.fecha } : {}),
        previo: p.tipo === 'fecha_cobro' ? { fechaPrometida: rec.prometida } : {},
      },
    }
  })
}
