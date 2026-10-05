// La CONEXIÓN de WhatsApp de la correduría (Tech Provider + Embedded Signup + Coexistence): lo que se
// guarda en `corredurias` (columnas heredadas wa_phone_number_id / wa_business_account_id /
// wa_access_token + las de prisma/sql/2026-10-05e_whatsapp_conexion.sql). Doc: docs/WHATSAPP.md.
//
// Las columnas nuevas NO están en el modelo Prisma a propósito: sin el SQL aplicado, añadirlas al modelo
// rompería cualquier lectura de `correduria` sin `select`. Aquí todo va en SQL crudo y, sin el SQL, falla
// SOLO lo de WhatsApp (el error sale clasificado como `esquema`).
//
// 🔐 El token de negocio se guarda CIFRADO (`encryptField`, prefijo `v1:`), nunca en claro, y nunca sale
// por el puerto. SQL sin prefijo de schema: la conexión ya trae `?schema=seguros`.

import { createHash } from 'node:crypto'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { decisionHistorial, estadoDeEventoCuenta, textoAvisoConexion, type EstadoConexion, type Eventos } from './eventos'

export type Conexion = {
  estado: EstadoConexion | null
  motivo: string | null
  eventoAt: string | null
  wabaId: string | null
  phoneNumberId: string | null
  businessId: string | null
  /** `sin_token` · `cifrado` · `en_claro_heredado` (el CRM antiguo pudo dejar uno en claro: hay que reconectar). */
  token: 'sin_token' | 'cifrado' | 'en_claro_heredado'
  conectadaAt: string | null
  suscritaAt: string | null
  verificacion: { isOnBizApp: boolean | null; platformType: string | null; at: string | null }
  sync: {
    contactos: { pedidaAt: string | null; recibidos: number | null; recibidosAt: string | null }
    historial: { pedidaAt: string | null; resultado: string | null; resultadoAt: string | null; hilosDescartados: number | null; mensajesDescartados: number | null }
  }
  /** Aviso de Telegram pendiente (lo manda plataforma y lo marca con `marcarAvisoEnviado`). */
  aviso: { texto: string; eventoAt: string } | null
}

type Fila = {
  wa_conexion_estado: string | null
  wa_conexion_motivo: string | null
  wa_conexion_evento_at: Date | null
  wa_conexion_avisado_at: Date | null
  wa_business_account_id: string | null
  wa_phone_number_id: string | null
  wa_business_id: string | null
  token_estado: 'sin_token' | 'cifrado' | 'en_claro_heredado'
  wa_conectada_at: Date | null
  wa_suscrita_at: Date | null
  wa_is_on_biz_app: boolean | null
  wa_platform_type: string | null
  wa_verificada_at: Date | null
  wa_sync_contactos_at: Date | null
  wa_contactos_sync_recibidos: number | null
  wa_contactos_sync_at: Date | null
  wa_sync_historial_at: Date | null
  wa_historial_resultado: string | null
  wa_historial_resultado_at: Date | null
  wa_historial_hilos_descartados: number | null
  wa_historial_mensajes_descartados: number | null
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)
const ESTADOS: readonly EstadoConexion[] = ['conectada', 'desconectada', 'baja']

export async function leerConexion(correduriaId: string): Promise<Conexion | null> {
  const [f] = await prismaAsegura().$queryRaw<Fila[]>(Prisma.sql`
    select wa_conexion_estado, wa_conexion_motivo, wa_conexion_evento_at, wa_conexion_avisado_at,
           wa_business_account_id, wa_phone_number_id, wa_business_id,
           case when wa_access_token is null or wa_access_token = '' then 'sin_token'
                when wa_access_token like 'v1:%' then 'cifrado' else 'en_claro_heredado' end as token_estado,
           wa_conectada_at, wa_suscrita_at, wa_is_on_biz_app, wa_platform_type, wa_verificada_at,
           wa_sync_contactos_at, wa_contactos_sync_recibidos, wa_contactos_sync_at,
           wa_sync_historial_at, wa_historial_resultado, wa_historial_resultado_at,
           wa_historial_hilos_descartados, wa_historial_mensajes_descartados
      from corredurias where id = ${correduriaId}::uuid`)
  if (!f) return null
  const estado = ESTADOS.includes(f.wa_conexion_estado as EstadoConexion) ? (f.wa_conexion_estado as EstadoConexion) : null
  const pendiente = estado !== null && f.wa_conexion_evento_at !== null && f.wa_conexion_avisado_at === null
  return {
    estado,
    motivo: f.wa_conexion_motivo,
    eventoAt: iso(f.wa_conexion_evento_at),
    wabaId: f.wa_business_account_id,
    phoneNumberId: f.wa_phone_number_id,
    businessId: f.wa_business_id,
    token: f.token_estado,
    conectadaAt: iso(f.wa_conectada_at),
    suscritaAt: iso(f.wa_suscrita_at),
    verificacion: { isOnBizApp: f.wa_is_on_biz_app, platformType: f.wa_platform_type, at: iso(f.wa_verificada_at) },
    sync: {
      contactos: { pedidaAt: iso(f.wa_sync_contactos_at), recibidos: f.wa_contactos_sync_recibidos, recibidosAt: iso(f.wa_contactos_sync_at) },
      historial: {
        pedidaAt: iso(f.wa_sync_historial_at),
        resultado: f.wa_historial_resultado,
        resultadoAt: iso(f.wa_historial_resultado_at),
        hilosDescartados: f.wa_historial_hilos_descartados,
        mensajesDescartados: f.wa_historial_mensajes_descartados,
      },
    },
    aviso: pendiente && estado ? { texto: textoAvisoConexion(estado, f.wa_conexion_motivo), eventoAt: iso(f.wa_conexion_evento_at) as string } : null,
  }
}

/**
 * Alta nueva (un `code` del Embedded Signup es de un solo uso: cada alta es un onboarding nuevo).
 * Guarda ids + token CIFRADO y reinicia lo que es de la conexión anterior (syncs, historial, verificación).
 * El alta no avisa por Telegram (la ha hecho Alberto): se marca como avisada.
 */
export async function guardarAltaConexion(
  correduriaId: string,
  d: { wabaId: string; phoneNumberId: string; businessId: string | null; tokenCifrado: string },
): Promise<void> {
  if (!d.tokenCifrado.startsWith('v1:')) throw new Error('token sin cifrar: no se guarda')
  const n = await prismaAsegura().$executeRaw(Prisma.sql`
    update corredurias set
      wa_business_account_id = ${d.wabaId}, wa_phone_number_id = ${d.phoneNumberId}, wa_business_id = ${d.businessId},
      wa_access_token = ${d.tokenCifrado},
      wa_conexion_estado = 'conectada', wa_conexion_motivo = 'ALTA', wa_conexion_evento_at = now(), wa_conexion_avisado_at = now(),
      wa_conectada_at = now(), wa_suscrita_at = null,
      wa_is_on_biz_app = null, wa_platform_type = null, wa_verificada_at = null,
      wa_sync_contactos_request_id = null, wa_sync_contactos_at = null, wa_contactos_sync_recibidos = null, wa_contactos_sync_at = null,
      wa_sync_historial_request_id = null, wa_sync_historial_at = null, wa_historial_resultado = null, wa_historial_resultado_at = null,
      wa_historial_hilos_descartados = null, wa_historial_mensajes_descartados = null,
      updated_at = now()
    where id = ${correduriaId}::uuid`)
  if (n !== 1) throw new Error('correduría no encontrada al guardar la conexión')
}

export async function guardarSuscripcion(correduriaId: string): Promise<void> {
  await prismaAsegura().$executeRaw(Prisma.sql`update corredurias set wa_suscrita_at = now() where id = ${correduriaId}::uuid`)
}

/** Cada sync se pide UNA vez: se guarda su request_id (o null si Meta no lo dio) y cuándo. */
export async function guardarSync(correduriaId: string, tipo: 'contactos' | 'historial', requestId: string | null): Promise<void> {
  const db = prismaAsegura()
  if (tipo === 'contactos') {
    await db.$executeRaw(Prisma.sql`update corredurias set wa_sync_contactos_request_id = ${requestId}, wa_sync_contactos_at = now() where id = ${correduriaId}::uuid`)
  } else {
    await db.$executeRaw(Prisma.sql`update corredurias set wa_sync_historial_request_id = ${requestId}, wa_sync_historial_at = now() where id = ${correduriaId}::uuid`)
  }
}

export async function guardarVerificacion(correduriaId: string, v: { isOnBizApp: boolean | null; platformType: string | null }): Promise<void> {
  await prismaAsegura().$executeRaw(Prisma.sql`
    update corredurias set wa_is_on_biz_app = ${v.isOnBizApp}, wa_platform_type = ${v.platformType ? v.platformType.slice(0, 60) : null}, wa_verificada_at = now()
     where id = ${correduriaId}::uuid`)
}

/** Plataforma mandó el Telegram del evento `eventoAt`: se marca SOLO ese (uno más nuevo sigue pendiente). */
export async function marcarAvisoEnviado(correduriaId: string, eventoAt: Date): Promise<number> {
  return prismaAsegura().$executeRaw(Prisma.sql`
    update corredurias set wa_conexion_avisado_at = now()
     where id = ${correduriaId}::uuid and wa_conexion_avisado_at is null
       and date_trunc('milliseconds', wa_conexion_evento_at) = date_trunc('milliseconds', ${eventoAt}::timestamptz)`)
}

export type ResumenEventos = {
  cuentas: { aplicados: number; otraWaba: number; ignorados: number }
  historial: { noCompartido: number; descartados: number; guardadosCrudo: number; errorMeta: number }
  contactosSync: number
  noAdmitidos: number
}

/**
 * Los eventos de cuenta del webhook (sin datos personales; se registran aunque el canal esté apagado).
 * `importarHistorial` y `canalActivo`: el historial solo se guarda en crudo con los DOS a '1'.
 */
export async function registrarEventosWebhook(correduriaId: string, ev: Eventos, opciones: { importarHistorial: boolean; canalActivo: boolean }): Promise<ResumenEventos> {
  const db = prismaAsegura()
  const r: ResumenEventos = {
    cuentas: { aplicados: 0, otraWaba: 0, ignorados: 0 },
    historial: { noCompartido: 0, descartados: 0, guardadosCrudo: 0, errorMeta: 0 },
    contactosSync: ev.contactosSync,
    noAdmitidos: ev.noAdmitidos,
  }

  for (const c of ev.cuentas) {
    const e = estadoDeEventoCuenta(c.evento, c.motivo)
    if (!e || !c.wabaId) {
      r.cuentas.ignorados++
      continue
    }
    // Solo la WABA que se conectó con el alta: otra no es de esta correduría.
    const n = await db.$executeRaw(Prisma.sql`
      update corredurias set wa_conexion_estado = ${e.estado}, wa_conexion_motivo = ${e.motivo},
             wa_conexion_evento_at = now(), wa_conexion_avisado_at = null, updated_at = now()
       where id = ${correduriaId}::uuid and wa_business_account_id = ${c.wabaId}`)
    if (n === 1) r.cuentas.aplicados++
    else r.cuentas.otraWaba++
  }

  for (const h of ev.historial) {
    const d = decisionHistorial(h, opciones.importarHistorial && opciones.canalActivo)
    if (d === 'vacio') continue
    if (d === 'guardar_crudo') {
      const valor = JSON.stringify(h.valor)
      const id = `historial:${createHash('sha256').update(valor, 'utf8').digest('hex').slice(0, 40)}`
      await db.$executeRaw(Prisma.sql`
        insert into channel_inbound_messages
          (channel, direction, external_message_id, event_type, event_timestamp, processing_status, correduria_id, payload)
        values ('whatsapp', 'inbound', ${id}, 'history', (now() at time zone 'UTC'), 'historial_sin_importar', ${correduriaId}::uuid, ${valor}::jsonb)
        on conflict (channel, direction, external_message_id) do nothing`)
      r.historial.guardadosCrudo++
    } else if (d === 'descartado') r.historial.descartados++
    else if (d === 'no_compartido') r.historial.noCompartido++
    else r.historial.errorMeta++
    const resultado = d === 'guardar_crudo' ? 'guardado_crudo' : d
    // 'no_compartido' manda: un trozo posterior no lo pisa.
    await db.$executeRaw(Prisma.sql`
      update corredurias set
        wa_historial_resultado = case when wa_historial_resultado = 'no_compartido' then wa_historial_resultado else ${resultado} end,
        wa_historial_resultado_at = now(),
        wa_historial_hilos_descartados = coalesce(wa_historial_hilos_descartados, 0) + ${d === 'descartado' ? h.hilos : 0},
        wa_historial_mensajes_descartados = coalesce(wa_historial_mensajes_descartados, 0) + ${d === 'descartado' ? h.mensajes : 0}
       where id = ${correduriaId}::uuid`)
  }

  if (ev.contactosSync > 0) {
    // Acuse y nada más: los contactos de la app NO se importan (la agenda manda desde Google Contacts).
    await db.$executeRaw(Prisma.sql`
      update corredurias set wa_contactos_sync_recibidos = coalesce(wa_contactos_sync_recibidos, 0) + ${ev.contactosSync}, wa_contactos_sync_at = now()
       where id = ${correduriaId}::uuid`)
  }
  return r
}

/** ¿Hay algo de cuenta que registrar? (para no tocar la BD en el caso normal de solo mensajes). */
export function hayEventosDeCuenta(ev: Eventos): boolean {
  return ev.cuentas.length > 0 || ev.historial.length > 0 || ev.contactosSync > 0
}
