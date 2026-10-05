// Fase 1 del canal WhatsApp (sin IA): crudo guardado → conversación + mensaje en el CRM.
//
//   1. `guardarCrudos` (lo llama el webhook ANTES de contestar): una fila por mensaje en
//      `channel_inbound_messages`, dedupe por (channel, direction, wamid). Nada más.
//   2. `procesarPendientes` (en `after()` del webhook y, de rescate, en el cron de análisis):
//      número → E.164 → hashes → ficha viva (siguiendo fusiones) → conversación (una por
//      correduría + teléfono) → mensaje con dirección, fecha, wamid y estado. Al acabar, el crudo
//      se MINIMIZA (fuera texto, nombre de perfil y números).
//
// Teléfono SIN ficha: NO se crea ficha (el número es el personal de Alberto y escriben familia y
// amigos). La conversación queda `pendiente_clasificar`, vinculada solo al hash y al número cifrado;
// la IA (Fase 2) decide si es comercial. Teléfono que casa con >1 ficha: no se vincula a ninguna.
// Opt-out (`wa_opt_out_at` en la ficha o en la conversación): se guarda el evento, no el texto.
//
// El número nunca se loguea ni se guarda en claro. El texto va cifrado (`encryptField`).
// SQL sin prefijo de schema: la conexión ya trae `?schema=seguros`.

import { aE164, formasHashTelefono, telefonoParaFicha } from '@central/module-seguros'
import { computeTelefonoLookupHash, encryptField } from '@central/module-seguros-pii'
import { createHash } from 'node:crypto'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { crudoMinimizado, textoDeMensaje, type MensajeExtraido } from './payload'

const CANAL = 'whatsapp'

/** El seudónimo que va en `lead_wa_phone` (varchar(30), CHECK heredado): nunca el número. */
export function seudonimoTelefono(hash: string): string {
  return `h:${hash.slice(0, 28)}`
}

export async function guardarCrudos(correduriaId: string, mensajes: readonly MensajeExtraido[]): Promise<{ nuevos: string[]; repetidos: number }> {
  const db = prismaAsegura()
  const nuevos: string[] = []
  let repetidos = 0
  for (const m of mensajes) {
    const filas = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into channel_inbound_messages
        (channel, direction, external_message_id, event_type, message_type, event_timestamp, processing_status, correduria_id, payload)
      values (${CANAL}, ${m.direccion === 'entrante' ? 'inbound' : 'outbound'}, ${m.wamid}, ${m.campo}, ${m.tipo.slice(0, 50)},
              (${m.fecha}::timestamptz at time zone 'UTC'), 'pendiente', ${correduriaId}::uuid, ${JSON.stringify(m.crudo)}::jsonb)
      on conflict (channel, direction, external_message_id) do nothing
      returning id::text as id`)
    if (filas[0]) nuevos.push(filas[0].id)
    else repetidos++
  }
  return { nuevos, repetidos }
}

/**
 * Un cuerpo FIRMADO por Meta que no casa con el esquema: se guarda igual (guardar primero,
 * preguntar después) con un id derivado del hash, para no perder un mensaje por un cambio de Meta.
 * Se minimiza con el resto del crudo a los RETENCION_CRUDO_DIAS.
 */
export async function guardarNoReconocido(correduriaId: string | null, cuerpoCrudo: string, parseado: unknown): Promise<void> {
  const hash = createHash('sha256').update(cuerpoCrudo, 'utf8').digest('hex')
  const payload = parseado === undefined ? { _no_json: cuerpoCrudo.slice(0, 20_000) } : parseado
  await prismaAsegura().$executeRaw(Prisma.sql`
    insert into channel_inbound_messages
      (channel, direction, external_message_id, event_type, event_timestamp, processing_status, correduria_id, payload)
    values (${CANAL}, 'inbound', ${`sin_wamid:${hash.slice(0, 40)}`}, 'no_reconocido', (now() at time zone 'UTC'), 'no_reconocido',
            ${correduriaId}::uuid, ${JSON.stringify(payload)}::jsonb)
    on conflict (channel, direction, external_message_id) do nothing`)
}

/**
 * Fichas VIVAS de la correduría con alguno de esos hashes (principal o secundario), siguiendo la
 * lápida de fusión hasta la superviviente. Dos fichas distintas nunca se funden aquí: se devuelven las dos.
 */
export async function fichasPorHashes(correduriaId: string, hashes: readonly string[]): Promise<string[]> {
  if (hashes.length === 0) return []
  const db = prismaAsegura()
  let filas = await db.$queryRaw<{ id: string; fusionada_en: string | null }[]>(Prisma.sql`
    select c.id::text as id, c.merged_into_cliente_id::text as fusionada_en
      from clientes c
     where c.correduria_id = ${correduriaId}::uuid and c.telefono_lookup_hash = any(${hashes as string[]}::text[])
    union
    select c.id::text, c.merged_into_cliente_id::text
      from cliente_telefonos t join clientes c on c.id = t.cliente_id
     where t.correduria_id = ${correduriaId}::uuid and c.correduria_id = ${correduriaId}::uuid
       and t.telefono_lookup_hash = any(${hashes as string[]}::text[])`)
  const vivas = new Set<string>()
  for (let salto = 0; salto < 5 && filas.length > 0; salto++) {
    const siguientes: string[] = []
    for (const f of filas) {
      if (f.fusionada_en === null) vivas.add(f.id)
      else siguientes.push(f.fusionada_en)
    }
    if (siguientes.length === 0) break
    filas = await db.$queryRaw<{ id: string; fusionada_en: string | null }[]>(Prisma.sql`
      select id::text as id, merged_into_cliente_id::text as fusionada_en from clientes
       where correduria_id = ${correduriaId}::uuid and id::text = any(${siguientes}::text[])`)
  }
  return [...vivas]
}

type FilaCruda = { id: string; direction: string; payload: unknown }

export type ResumenProceso = { procesados: number; optOut: number; invalidos: number; errores: number }

/**
 * Procesa las filas `pendiente`/`error` del canal (todas, o solo `ids`). Idempotente: el mensaje se
 * deduplica por (conversación, wamid) y la fila cruda solo se marca `procesado` al final.
 */
export async function procesarPendientes(correduriaId: string, ids?: readonly string[], limite = 50): Promise<ResumenProceso> {
  const db = prismaAsegura()
  const soloIds = ids && ids.length > 0 ? [...ids] : null
  const filas = await db.$queryRaw<FilaCruda[]>(Prisma.sql`
    select id::text as id, direction, payload from channel_inbound_messages
     where channel = ${CANAL} and correduria_id = ${correduriaId}::uuid
       and processing_status in ('pendiente', 'error') and payload_minimizado_at is null
       and (${soloIds}::text[] is null or id::text = any(${soloIds}::text[]))
     order by event_timestamp asc
     limit ${limite}`)
  const r: ResumenProceso = { procesados: 0, optOut: 0, invalidos: 0, errores: 0 }
  for (const f of filas) {
    try {
      const estado = await procesarUna(correduriaId, f)
      if (estado === 'procesado') r.procesados++
      else if (estado === 'opt_out') r.optOut++
      else if (estado === 'telefono_invalido') r.invalidos++
      else r.errores++
    } catch (e) {
      r.errores++
      // Solo el tipo de fallo: el mensaje de Prisma puede citar valores.
      console.error('[whatsapp] no se pudo procesar una fila cruda:', e instanceof Error ? e.name : 'error')
      await marcar(f.id, 'error', 'excepcion').catch(() => {})
    }
  }
  return r
}

async function marcar(id: string, estado: string, error: string | null, minimizar?: unknown): Promise<void> {
  await prismaAsegura().$executeRaw(Prisma.sql`
    update channel_inbound_messages
       set processing_status = ${estado}, processing_error = ${error},
           payload = case when ${minimizar === undefined} then payload else ${JSON.stringify(minimizar ?? {})}::jsonb end,
           payload_minimizado_at = case when ${minimizar === undefined} then payload_minimizado_at else now() end,
           lead_phone = null, lead_name = null, message_text = null
     where id = ${id}::uuid`)
}

async function procesarUna(correduriaId: string, f: FilaCruda): Promise<string> {
  const crudo = (f.payload && typeof f.payload === 'object' ? f.payload : {}) as Record<string, unknown>
  const m = (crudo.message && typeof crudo.message === 'object' ? crudo.message : null) as (Record<string, unknown> & { type: string; text?: { body: string } }) | null
  if (!m || typeof m.id !== 'string' || typeof m.type !== 'string') {
    await marcar(f.id, 'telefono_invalido', 'sin_mensaje', crudoMinimizado(crudo))
    return 'telefono_invalido'
  }
  const direccion = f.direction === 'outbound' ? 'saliente' : 'entrante'
  const contraparte = direccion === 'entrante' ? m.from : m.to
  // El wa_id de Meta llega sin «+» (34600123456): con región ES se leería como nacional.
  const e164 = aE164(typeof contraparte === 'string' ? (/^\d{10,15}$/.test(contraparte) ? `+${contraparte}` : contraparte) : null)
  if (e164 === null) {
    await marcar(f.id, 'telefono_invalido', null, crudoMinimizado(crudo))
    return 'telefono_invalido'
  }
  // Sin PII_LOOKUP_KEY no hay hash: no se puede ni buscar ni agrupar. Se reintenta (no se minimiza).
  const hash = computeTelefonoLookupHash(telefonoParaFicha(e164))
  if (hash === null) {
    await marcar(f.id, 'error', 'sin_clave_pii')
    return 'error'
  }
  const hashes = formasHashTelefono(e164).map((x) => computeTelefonoLookupHash(x)).filter((x): x is string => x !== null)
  const fichas = await fichasPorHashes(correduriaId, hashes)
  const clienteId = fichas.length === 1 ? fichas[0] : null
  const fecha = /^\d{1,12}$/.test(String(m.timestamp)) ? new Date(Number(m.timestamp) * 1000) : new Date()
  const texto = textoDeMensaje(m)
  const contacto = crudo.contact as { profile?: { name?: unknown } } | undefined
  const perfil = direccion === 'entrante' && typeof contacto?.profile?.name === 'string' && contacto.profile.name.trim() !== '' ? contacto.profile.name.trim().slice(0, 120) : null

  // Cifrado FUERA de la transacción: sin clave, encryptField lanza en producción → fila en `error`.
  const telefonoCifrado = encryptField(e164)
  const perfilCifrado = perfil ? encryptField(perfil) : null
  const db = prismaAsegura()

  const [optOutFicha] = clienteId
    ? await db.$queryRaw<{ opt_out: boolean }[]>(Prisma.sql`
        select wa_opt_out_at is not null as opt_out from clientes where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`)
    : [{ opt_out: false }]

  const resultado = await db.$transaction(async (tx) => {
    const [conv] = await tx.$queryRaw<{ id: string; estado: string; opt_out: boolean; cliente_id: string | null }[]>(Prisma.sql`
      insert into conversaciones
        (correduria_id, cliente_id, wa_thread_id, estado, lead_wa_phone, wa_telefono_hash, wa_telefono_cifrado,
         wa_perfil_nombre_cifrado, clientes_candidatos, updated_at)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${`wa:${hash}`}, ${clienteId ? 'abierta' : 'pendiente_clasificar'},
              ${clienteId ? null : seudonimoTelefono(hash)}, ${hash}, ${telefonoCifrado}, ${perfilCifrado}, ${fichas.length}, now())
      on conflict (correduria_id, wa_telefono_hash) where wa_telefono_hash is not null do update set
        clientes_candidatos = excluded.clientes_candidatos,
        cliente_id = coalesce(conversaciones.cliente_id, excluded.cliente_id),
        estado = case when conversaciones.cliente_id is null and excluded.cliente_id is not null
                       and conversaciones.estado = 'pendiente_clasificar' then 'abierta' else conversaciones.estado end,
        wa_perfil_nombre_cifrado = coalesce(excluded.wa_perfil_nombre_cifrado, conversaciones.wa_perfil_nombre_cifrado),
        updated_at = now()
      returning id::text as id, estado, wa_opt_out_at is not null as opt_out, cliente_id::text as cliente_id`)
    if (conv.opt_out || optOutFicha?.opt_out) return { estado: 'opt_out' as const, conversacionId: conv.id, mensajeId: null, clienteId: conv.cliente_id }
    // Conversación ya descartada como personal: consta el mensaje (fecha, dirección, tipo), no su texto.
    const personal = conv.estado === 'descartada_personal'
    const [msg] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into mensajes (conversacion_id, rol, contenido, wa_message_id, metadata, direccion, tipo, enviado_at, estado, texto_purgado_at)
      values (${conv.id}::uuid, ${direccion === 'entrante' ? 'cliente' : 'corredor'}, ${personal ? '' : encryptField(texto)}, ${m.id},
              ${JSON.stringify({ canal: CANAL, campo: crudo.field ?? null })}::jsonb, ${direccion}, ${m.type.slice(0, 30)}, ${fecha},
              ${direccion === 'entrante' ? 'recibido' : 'enviado'}, ${personal ? new Date() : null})
      on conflict (conversacion_id, wa_message_id) where direccion is not null and wa_message_id is not null do nothing
      returning id::text as id`)
    const mensajeId =
      msg?.id ??
      (await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        select id::text as id from mensajes where conversacion_id = ${conv.id}::uuid and wa_message_id = ${m.id} and direccion is not null limit 1`))[0]?.id ??
      null
    await tx.$executeRaw(Prisma.sql`
      update conversaciones
         set ultimo_mensaje_at = greatest(coalesce(ultimo_mensaje_at, ${fecha}), ${fecha}), updated_at = now()
       where id = ${conv.id}::uuid and correduria_id = ${correduriaId}::uuid`)
    return { estado: 'procesado' as const, conversacionId: conv.id, mensajeId, clienteId: conv.cliente_id }
  })

  await prismaAsegura().$executeRaw(Prisma.sql`
    update channel_inbound_messages
       set processing_status = ${resultado.estado}, processing_error = null,
           conversacion_id = ${resultado.conversacionId}::uuid, mensaje_id = ${resultado.mensajeId}::uuid,
           cliente_id = ${resultado.clienteId}::uuid,
           payload = ${JSON.stringify(crudoMinimizado(crudo))}::jsonb, payload_minimizado_at = now(),
           lead_phone = null, lead_name = null, message_text = null
     where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid`)
  return resultado.estado
}
