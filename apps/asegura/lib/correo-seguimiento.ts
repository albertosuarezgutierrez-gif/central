// Seguimiento de los correos a clientes (25/09/2026, Alberto: «de todos los correos… comprobación de lo
// máximo posible de los envíos, por si algún cliente reclama»).
//
// Dos tablas (prisma/sql/2026-09-25b_correo_seguimiento.sql):
//  - `correo_envio`: el correo que salió, con su cliente, tipo, asunto, destino cifrado e id de Resend.
//  - `correo_evento`: cada evento que manda Resend, tal cual y con su hora. Nunca se edita: es la prueba.
//
// Lo que NO afirma: «abierto» no prueba que el cliente lo leyera (Apple Mail precarga las imágenes de
// todo lo que recibe) ni su ausencia que no lo leyera (quien bloquea imágenes). La prueba fuerte es
// «entregado» (el servidor del destinatario lo aceptó) y, de lectura, el CLIC.
import { Prisma } from './generated/asegura-client'
import { encryptField } from '@central/module-seguros-pii'
import { prismaAsegura } from './asegura-db'
import { descifrarCampo } from './cartera-edicion'

import { type EventoCorreo, type TipoEventoCorreo } from './correo-eventos'
export { interpretarEventoCorreo, EVENTOS_CORREO, type EventoCorreo, type TipoEventoCorreo } from './correo-eventos'

/** Guarda el evento. Idempotente por `svix-id`: un reintento de Resend no duplica. */
export async function registrarEventoCorreo(svixId: string, e: EventoCorreo): Promise<void> {
  await prismaAsegura().$executeRaw(Prisma.sql`
    insert into correo_evento (svix_id, resend_id, tipo, ocurrido_en, detalle)
    values (${svixId}, ${e.resendId}, ${e.tipo}, ${e.ocurridoEn}, ${JSON.stringify(e.detalle)}::jsonb)
    on conflict (svix_id) do nothing`)
}

export type EnvioARegistrar = {
  correduriaId: string
  clienteId: string | null
  polizaId?: string | null
  tipo: string
  asunto: string
  destino: string
  resendId: string | null
  proveedor: 'resend_api' | 'smtp'
  estado: 'enviado' | 'fallido'
  error?: string | null
}

/**
 * Deja constancia del correo. Si falla, NO se lanza: el correo ya salió (o ya falló) y tumbar al
 * llamante por el registro sería peor. Se loguea sin la dirección.
 */
export async function registrarEnvioCorreo(e: EnvioARegistrar): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into correo_envio (correduria_id, cliente_id, poliza_id, tipo, asunto, destino_cifrado, resend_id, proveedor, estado, error)
      values (${e.correduriaId}::uuid, ${e.clienteId}::uuid, ${e.polizaId ?? null}::uuid, ${e.tipo}, ${e.asunto.slice(0, 300)}, ${encryptField(e.destino)},
              ${e.resendId}, ${e.proveedor}, ${e.estado}, ${e.error?.slice(0, 500) ?? null})
      on conflict (resend_id) do nothing`)
  } catch (err) {
    console.error(`[correo-seguimiento] no se pudo registrar el envío (${e.tipo}):`, err instanceof Error ? err.message : err)
  }
}

export type EventoFicha = { tipo: TipoEventoCorreo; fecha: string; detalle: Record<string, string> }
export type CorreoFicha = {
  id: string
  tipo: string
  asunto: string
  /** Dirección a la que salió. `null` = no se pudo descifrar (se dice, no se inventa). */
  destino: string | null
  enviadoEn: string
  estado: 'enviado' | 'fallido'
  error: string | null
  /** `false` = salió por SMTP sin id de Resend: no habrá entregado/abierto/clic que mostrar. */
  conSeguimiento: boolean
  eventos: EventoFicha[]
}

/** Los correos del cliente con todos sus eventos, el más reciente primero. `null` = no se pudo leer. */
export async function correosCliente(correduriaId: string, clienteId: string, limite = 50): Promise<CorreoFicha[] | null> {
  try {
    const db = prismaAsegura()
    const envios = await db.$queryRaw<{
      id: string; tipo: string; asunto: string; destino_cifrado: string; resend_id: string | null
      estado: 'enviado' | 'fallido'; error: string | null; creado_en: Date
    }[]>(Prisma.sql`
      select id, tipo, asunto, destino_cifrado, resend_id, estado, error, creado_en
      from correo_envio
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid
      order by creado_en desc
      limit ${limite}`)
    const ids = envios.map((e) => e.resend_id).filter((x): x is string => x !== null)
    const eventos = ids.length === 0 ? [] : await db.$queryRaw<{ resend_id: string; tipo: TipoEventoCorreo; ocurrido_en: Date; detalle: unknown }[]>(Prisma.sql`
      select resend_id, tipo, ocurrido_en, detalle
      from correo_evento
      where resend_id in (${Prisma.join(ids)})
      order by ocurrido_en asc`)
    return envios.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      asunto: e.asunto,
      destino: descifrarCampo(e.destino_cifrado),
      enviadoEn: e.creado_en.toISOString(),
      estado: e.estado,
      error: e.error,
      conSeguimiento: e.resend_id !== null,
      eventos: eventos
        .filter((v) => v.resend_id === e.resend_id)
        .map((v) => ({
          tipo: v.tipo,
          fecha: v.ocurrido_en.toISOString(),
          detalle: typeof v.detalle === 'object' && v.detalle !== null ? (v.detalle as Record<string, string>) : {},
        })),
    }))
  } catch {
    return null
  }
}
