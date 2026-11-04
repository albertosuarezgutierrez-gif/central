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
import { botonDeshacer, botonesPropuesta, cerrarSiFallaDevolver, lineaPropuesta, payloadPropuesta, puedeDeshacer, puedeResolver, tareaAlAplicar, type Decision, type TipoPropuesta } from './propuestas-reglas'
import { ACTOR_AUTONOMO, ENV_AUTONOMIA, ENV_UMBRAL, autonomiaActiva, decidirAutonomia, extractoRedactado, leerCorreccion, type Resolucion } from './aprendizaje-reglas'
import { rachaDe, registrarContexto, registrarDeshecha, registrarResolucion } from './aprendizaje'

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
    if (!fila) return { ok: false, motivo: 'ya_pendiente' }
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

  let reclamada: FilaPropuesta | undefined
  try {
    ;[reclamada] = await db.$queryRaw<FilaPropuesta[]>(Prisma.sql`
      with antes as (
        select payload->>'fecha' as fecha_original from whatsapp_propuestas where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
      )
      update whatsapp_propuestas set estado = ${nuevo}, resuelta_at = now(), resuelta_por = ${actor.slice(0, 120)},
             payload = case when ${nuevaFecha}::text is not null and tipo <> 'pagado'
                            then jsonb_set(payload, '{fecha}', to_jsonb(${nuevaFecha}::text)) else payload end
       where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'
         and (${decision} = 'descartar' or caduca_at > ${ahora})
      returning id::text as id, tipo, estado, caduca_at, cliente_id::text as cliente_id, recibo_id::text as recibo_id,
                oportunidad_id::text as oportunidad_id, payload->>'fecha' as fecha, (select fecha_original from antes) as fecha_original`)
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
  const aprender = (resolucion: Resolucion, final: { fecha?: string } | null) =>
    registrarResolucion(correduriaId, {
      propuestaId: id, tipo: reclamada!.tipo, resolucion, autonoma, actor, propuesto, final,
      observacion: observacion ? extractoRedactado(observacion) : null,
    })

  if (decision === 'descartar') {
    await historial(correduriaId, reclamada.cliente_id, `Propuesta de WhatsApp (${reclamada.tipo}) descartada — por ${actor}`).catch(() => {})
    await aprender('descartada', null)
    return { ok: true, estado: 'descartada', tipo: reclamada.tipo, resultado: {} }
  }

  let resultado: Record<string, unknown>
  try {
    const r = await aplicar(correduriaId, reclamada, actor, ahora, observacion)
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
  if (decision === 'modificar') resultado = { ...resultado, modificada: { fechaOriginal: reclamada.fecha_original, fechaFinal: reclamada.fecha, conObservacion: observacion !== null } }
  await db.$executeRaw(Prisma.sql`
    update whatsapp_propuestas set resultado = ${JSON.stringify(resultado)}::jsonb
     where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
  await aprender(decision === 'modificar' ? 'modificada' : 'aplicada', reclamada.fecha ? { fecha: reclamada.fecha } : {})
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
    console.error('[whatsapp-ia] modo autónomo:', e instanceof Error ? e.name : 'error')
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
export async function deshacerPropuesta(correduriaId: string, id: string, actor: string, ahora: Date = new Date()): Promise<ResultadoDeshacer> {
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
  // Pulsar ↩️ ya es la señal: la racha de ese tipo vuelve a 0 aunque revertir no pueda hacerse.
  await registrarDeshecha(correduriaId, id, actor)
  const soltar = () =>
    db.$executeRaw(Prisma.sql`
      update whatsapp_propuestas set resultado = resultado - 'deshecha_at' - 'deshecha_por'
       where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`).catch(() => 0)
  try {
    const r = await revertir(correduriaId, fila, actor, ahora)
    if (r !== 'ok') {
      await soltar()
      return { ok: false, estado: r, status: r === 'cambiado_despues' ? 409 : 500 }
    }
  } catch (e) {
    console.error('[whatsapp-ia] deshacer propuesta:', e instanceof Error ? e.name : 'error')
    await soltar()
    return { ok: false, estado: 'fallo_al_deshacer', status: 500 }
  }
  return { ok: true, estado: 'deshecha', tipo: fila.tipo }
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

async function revertir(correduriaId: string, p: FilaDeshacer, actor: string, ahora: Date): Promise<'ok' | 'cambiado_despues' | 'fallo_al_deshacer'> {
  const previo = (p.resultado.previo ?? {}) as Record<string, unknown>
  const tareaId = texto(p.resultado.tareaId)
  if (p.tipo === 'vencimiento') {
    if (!p.oportunidad_id) return 'fallo_al_deshacer'
    const [o] = await prismaAsegura().$queryRaw<{ fecha: string | null }[]>(Prisma.sql`
      select to_char(fecha_fin_vigencia, 'YYYY-MM-DD') as fecha from oportunidades
       where id = ${p.oportunidad_id}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!o) return 'fallo_al_deshacer'
    if (o.fecha !== p.fecha) return 'cambiado_despues'
    const anterior = texto(previo.fechaFinVigencia)
    const r = await editarOportunidad(correduriaId, p.oportunidad_id, { fechaFinVigencia: anterior }, actor, { reprogramar: anterior !== null, hoy: ahora })
    if (!r.ok) return 'fallo_al_deshacer'
    await historial(correduriaId, p.cliente_id, `WhatsApp: deshecho el vencimiento aplicado solo (vuelve a ${anterior ?? 'sin fecha'}) — por ${actor}`).catch(() => {})
    return 'ok'
  }
  return prismaAsegura().$transaction(async (tx) => {
    if (p.tipo === 'fecha_cobro') {
      if (!p.recibo_id) return 'fallo_al_deshacer' as const
      // Solo si nadie la ha cambiado después: lo que haya puesto una persona no se pisa.
      const n = await tx.$executeRaw(Prisma.sql`
        update poliza_recibos set fecha_prometida_pago = ${texto(previo.fechaPrometida)}::date, updated_at = now()
         where id = ${p.recibo_id}::uuid and correduria_id = ${correduriaId}::uuid
           and fecha_prometida_pago is not distinct from ${p.fecha}::date`)
      if (n === 0) return 'cambiado_despues' as const
    }
    if (tareaId) {
      await tx.$executeRaw(Prisma.sql`
        update gestiones set estado = 'cerrada', observaciones = coalesce(observaciones, '') || ${`\n— Deshecha (propuesta de WhatsApp aplicada sola) por ${actor}`}, updated_at = now()
         where id = ${tareaId}::uuid and correduria_id = ${correduriaId}::uuid and origen_trigger = ${ORIGEN_TAREA_IA}
           and estado::text in ('pendiente', 'en_curso')`)
    }
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${p.cliente_id}::uuid, cast('contacto' as tipo_historial_interno),
              ${`WhatsApp: deshecha la propuesta «${p.tipo}» aplicada sola — por ${actor}`.slice(0, 2000)})`)
    return 'ok' as const
  })
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
    return { ok: true, resultado: { oportunidadId: p.oportunidad_id, tarea: r.tarea, previo: { fechaFinVigencia: antes?.fecha ?? null } } }
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
