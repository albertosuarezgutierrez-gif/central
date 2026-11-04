// Respuesta automática de la IA por WhatsApp: la parte con BD y red. Las reglas son PURAS en `respuesta-reglas.ts`;
// el transporte (único `/messages` del canal) en `envio.ts`. Solo se llama con ASEGURA_WHATSAPP_RESPUESTA_ACTIVA=1.
//
// IDEMPOTENCIA (nunca dos respuestas al mismo entrante, ni con reintentos del cron ni con carreras):
//   1. el analizador RECLAMA la conversación (`for update skip locked`), así que dos pasadas no la cogen a la vez;
//   2. la respuesta se RESERVA antes de enviarla: fila en `mensajes` (saliente, `generado_por='ia'`, `estado='enviando'`)
//      con `responde_a_mensaje_id` = el entrante, bajo el índice ÚNICO `uq_mensajes_responde_a` (SQL 2026-11-04c). El
//      INSERT re-comprueba en la MISMA sentencia: silenciada, opt-out, ningún saliente posterior al entrante, ningún
//      entrante más nuevo y el tope del día;
//   3. UN intento de envío. Si falla (o se corta tras reservar) la fila queda `fallido`/`enviando` y NO se reintenta.
// Sin el SQL 2026-11-04c: `sin_migracion`, no se envía nada.
//
// 🔐 Ni número ni texto en logs. El texto enviado se guarda CIFRADO como cualquier mensaje.

import { decryptField, encryptField } from '@central/module-seguros-pii'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { esColumnaAusente, esTablaAusente } from '../pg-error'
import { versionGraph } from './graph'
import { crearEnviador } from './envio'
import { secretoWhatsapp } from './secretos'
import { leerDestinoWebhook } from './conexion'
import { tokenCorreduria } from './media-procesar'
import { MAX_RESPUESTAS_CONVERSACION_DIA, MAX_RESPUESTAS_DIA, type EstadoConversacionRespuesta } from './respuesta-reglas'

export const ACTOR_RESPUESTA = 'agente:whatsapp-ia-respuesta'
const faltaMigracion = (e: unknown) => esTablaAusente(e) || esColumnaAusente(e)
/** Inicio del día de hoy en Madrid (el tope es por día natural de Alberto). */
const INICIO_DIA = Prisma.sql`(date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')`

type Base = Pick<EstadoConversacionRespuesta, 'flag' | 'tipoFicha' | 'clientesCandidatos' | 'estadoConversacion' | 'optOut'>

/** Lo que la regla pura necesita de la BD. `sin_migracion` si faltan las columnas de 2026-11-04c. */
export async function leerEstadoRespuesta(correduriaId: string, conversacionId: string, base: Base, ahora = new Date()): Promise<EstadoConversacionRespuesta | 'sin_migracion'> {
  const db = prismaAsegura()
  try {
    const [f] = await db.$queryRaw<{
      silenciada: boolean
      ent_id: string | null; ent_tipo: string | null; ent_fecha: Date | null; ent_historial: boolean | null
      sal_fecha: Date | null; sal_ia: boolean | null
      humano_previo: boolean; ya: boolean; hoy_conv: number; hoy_total: number
    }[]>(Prisma.sql`
      with c as (
        select id, ia_silenciada_at from conversaciones where id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid
      ), ent as (
        select m.id, m.tipo, m.enviado_at, coalesce(m.metadata->>'origen', '') = 'historial' as historial
          from mensajes m join c on c.id = m.conversacion_id
         where m.direccion = 'entrante' and m.enviado_at is not null
         order by m.enviado_at desc, m.id desc limit 1
      ), sal as (
        select m.enviado_at, m.generado_por is not null as ia
          from mensajes m join c on c.id = m.conversacion_id
         where m.direccion = 'saliente' and m.enviado_at is not null
         order by m.enviado_at desc limit 1
      )
      select (select ia_silenciada_at is not null from c) as silenciada,
             (select id::text from ent) as ent_id, (select tipo from ent) as ent_tipo,
             (select enviado_at from ent) as ent_fecha, (select historial from ent) as ent_historial,
             (select enviado_at from sal) as sal_fecha, (select ia from sal) as sal_ia,
             exists (select 1 from mensajes m join c on c.id = m.conversacion_id
                      where m.direccion = 'saliente' and m.generado_por is null
                        and m.enviado_at < coalesce((select enviado_at from ent), now())) as humano_previo,
             exists (select 1 from mensajes m join c on c.id = m.conversacion_id
                      where m.responde_a_mensaje_id = (select id from ent)) as ya,
             (select count(*)::int from mensajes m join c on c.id = m.conversacion_id
               where m.responde_a_mensaje_id is not null and m.enviado_at >= ${INICIO_DIA}) as hoy_conv,
             (select count(*)::int from mensajes m join conversaciones cc on cc.id = m.conversacion_id
               where cc.correduria_id = ${correduriaId}::uuid and m.responde_a_mensaje_id is not null
                 and m.enviado_at >= ${INICIO_DIA}) as hoy_total`)
    if (!f) return 'sin_migracion'
    return {
      ...base,
      silenciada: f.silenciada === true,
      ultimaEntrante: f.ent_id && f.ent_fecha ? { id: f.ent_id, tipo: f.ent_tipo ?? '', fecha: f.ent_fecha, historial: f.ent_historial === true } : null,
      ultimoSaliente: f.sal_fecha ? { fecha: f.sal_fecha, ia: f.sal_ia === true } : null,
      haySalienteHumanoPrevio: f.humano_previo,
      yaRespondida: f.ya,
      respuestasHoyConversacion: f.hoy_conv,
      respuestasHoyTotal: f.hoy_total,
      ahora,
    }
  } catch (e) {
    if (faltaMigracion(e)) return 'sin_migracion'
    throw e
  }
}

export type ResultadoRespuesta = 'enviada' | 'fallida' | 'ya_respondida' | 'sin_conexion' | 'sin_migracion'

/**
 * Reserva + envío + sello. `telefonoCifrado` = `conversaciones.wa_telefono_cifrado`. `clase` solo para el registro.
 * `fetchImpl` se inyecta en pruebas manuales; en producción, el `fetch` global.
 */
export async function enviarRespuesta(
  correduriaId: string,
  p: { conversacionId: string; entranteId: string; telefonoCifrado: string | null; texto: string; clase: 'ia' | 'acuse' | 'baja' },
): Promise<ResultadoRespuesta> {
  const db = prismaAsegura()
  // Antes de reservar: si no hay con qué enviar, no se deja una fila «enviando» que bloquee para siempre.
  const version = versionGraph()
  const token = await tokenCorreduria(correduriaId)
  const destino = secretoWhatsapp('WHATSAPP_PHONE_NUMBER_ID') ?? (await leerDestinoWebhook(correduriaId))?.phoneNumberId ?? null
  let telefono: string | null = null
  try {
    telefono = p.telefonoCifrado ? (p.telefonoCifrado.startsWith('v1:') ? decryptField(p.telefonoCifrado) : null) : null
  } catch {
    telefono = null
  }
  if (!version || !token || !destino || !telefono) {
    await auditar(p.conversacionId, null, 'sin_conexion')
    return 'sin_conexion'
  }

  let reservada: string | null
  try {
    const [fila] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into mensajes (conversacion_id, rol, contenido, metadata, direccion, tipo, enviado_at, estado, responde_a_mensaje_id, generado_por)
      select c.id, 'bot', ${encryptField(p.texto)}, ${JSON.stringify({ canal: 'whatsapp', campo: 'cloud_api', ia: true, clase: p.clase })}::jsonb,
             'saliente', 'text', now(), 'enviando', e.id, 'ia'
        from conversaciones c join mensajes e on e.conversacion_id = c.id
       where c.id = ${p.conversacionId}::uuid and c.correduria_id = ${correduriaId}::uuid
         and c.estado = 'abierta' and c.ia_silenciada_at is null and c.wa_opt_out_at is null
         and not exists (select 1 from clientes cl where cl.id = c.cliente_id and cl.wa_opt_out_at is not null)
         and e.id = ${p.entranteId}::uuid and e.direccion = 'entrante'
         and not exists (select 1 from mensajes s where s.conversacion_id = c.id and s.direccion = 'saliente' and s.enviado_at >= e.enviado_at)
         and not exists (select 1 from mensajes n where n.conversacion_id = c.id and n.direccion = 'entrante' and n.enviado_at > e.enviado_at)
         and (select count(*) from mensajes r where r.conversacion_id = c.id and r.responde_a_mensaje_id is not null
                and r.enviado_at >= ${INICIO_DIA}) < ${MAX_RESPUESTAS_CONVERSACION_DIA}
         and (select count(*) from mensajes r join conversaciones rc on rc.id = r.conversacion_id
               where rc.correduria_id = ${correduriaId}::uuid and r.responde_a_mensaje_id is not null
                 and r.enviado_at >= ${INICIO_DIA}) < ${MAX_RESPUESTAS_DIA}
      on conflict (responde_a_mensaje_id) where responde_a_mensaje_id is not null do nothing
      returning id::text as id`)
    reservada = fila?.id ?? null
  } catch (e) {
    if (faltaMigracion(e)) return 'sin_migracion'
    throw e
  }
  if (!reservada) {
    await auditar(p.conversacionId, null, 'ya_respondida')
    return 'ya_respondida'
  }

  const r = await crearEnviador({ version }).enviarTexto({ phoneNumberId: destino, token, toE164: telefono, texto: p.texto })
  await db.$executeRaw(Prisma.sql`
    update mensajes set estado = ${r.ok ? 'enviado' : 'fallido'},
           wa_message_id = ${r.ok && r.wamid ? r.wamid : null},
           metadata = metadata || ${JSON.stringify(r.ok ? {} : { error_meta: r.codigo, http: r.http })}::jsonb
     where id = ${reservada}::uuid
       and exists (select 1 from conversaciones c where c.id = mensajes.conversacion_id and c.correduria_id = ${correduriaId}::uuid)`)
  if (!r.ok) console.error(`[whatsapp-ia] respuesta no enviada: http=${r.http} codigo=${r.codigo ?? 'sin_codigo'}`)
  await auditar(p.conversacionId, reservada, r.ok ? 'enviada' : 'fallida')
  return r.ok ? 'enviada' : 'fallida'
}

/** 🔇 Silenciar la IA en UNA conversación (botón de Telegram `wap_si`, solo el titular). Idempotente. */
export async function silenciarConversacion(correduriaId: string, conversacionId: string, actor: string): Promise<'silenciada' | 'ya_silenciada' | 'no_encontrada' | 'sin_migracion'> {
  try {
    const [f] = await prismaAsegura().$queryRaw<{ antes: Date | null }[]>(Prisma.sql`
      update conversaciones c set ia_silenciada_at = coalesce(c.ia_silenciada_at, now()),
             ia_silenciada_por = coalesce(c.ia_silenciada_por, ${actor.slice(0, 80)}), updated_at = now()
        from (select id, ia_silenciada_at as antes from conversaciones where id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid for update) v
       where c.id = v.id and c.correduria_id = ${correduriaId}::uuid
      returning v.antes`)
    if (!f) return 'no_encontrada'
    return f.antes ? 'ya_silenciada' : 'silenciada'
  } catch (e) {
    if (faltaMigracion(e)) return 'sin_migracion'
    throw e
  }
}

async function auditar(conversacionId: string, mensajeId: string | null, resultado: string): Promise<void> {
  const estado = resultado === 'enviada' ? 200 : resultado === 'ya_respondida' ? 409 : resultado === 'sin_conexion' ? 503 : 502
  const ids = { conversacionId, ...(mensajeId ? { mensajeId } : {}) }
  const cambios = [{ entidad: 'whatsapp_ia', id: conversacionId, campo: 'respuesta', antes: null, despues: resultado }]
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into auditoria (actor_tipo, actor_id, metodo, ruta, estado_http, ids, cambios)
      values ('agente', 'whatsapp-ia', 'IA', '/api/cron/whatsapp-analizar', ${estado}, ${JSON.stringify(ids)}::jsonb, ${JSON.stringify(cambios)}::jsonb)`)
  } catch (e) {
    console.error('[auditoria] respuesta de WhatsApp sin registrar:', e instanceof Error ? e.name : 'error')
  }
}
