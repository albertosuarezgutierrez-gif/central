// Cola única de aprobaciones (Fase 2 de ASegura OS, pieza 2-c).
//
// - `proponerReciboDevuelto()` la llama el detector de cartera, DENTRO de su transacción, cuando un
//   recibo pasa a `devuelto`: redacta el aviso al cliente y lo deja pendiente de OK.
// - `aprobacionesPendientes()` es lo que pinta «Hoy · Esperan tu OK» en plataforma.
// - `decidirAprobacion()` aplica el OK o el no. Con OK, reclama la fila (`enviando`) ANTES de mandar:
//   un doble clic no manda dos correos. La dirección se lee de la ficha en ese momento.
//
// Nada de esto manda un correo sin una decisión humana: la política (`POLITICA`) lo exige, y la
// única llamada que envía está detrás de `decision: 'aprobar'`.
//
// El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import { POLITICA, borradorReciboDevuelto, caducaEn, importeEiac, remitenteCorreo, type Decision } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { rechazoDeRemitente } from './correo-invitacion-portal.ts'
import { emailDeFicha } from './email-ficha'

type Tx = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw' | '$executeRaw'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ORIGEN_RECIBO_DEVUELTO = 'recibo_devuelto'

/** `true` si ha dejado una propuesta nueva. Idempotente por `clave` (una por recibo y vencimiento). */
export async function proponerReciboDevuelto(tx: Tx, correduriaId: string, reciboId: string, eventoId: string | null): Promise<boolean> {
  if (POLITICA.enviar_correo_cliente === 'prohibido') return false
  const [r] = await tx.$queryRaw<{ clienteId: string; polizaId: string; ramo: string | null; compania: string | null; numeroPoliza: string | null; importe: string | null; vencimiento: string | null }[]>`
    select p.cliente_id::text as "clienteId", p.id::text as "polizaId", p.tipo::text as ramo, p.aseguradora as compania,
           p.numero_poliza as "numeroPoliza", r.prima_total as importe,
           to_char(r.fecha_vencimiento at time zone 'Europe/Madrid', 'YYYY-MM-DD') as vencimiento
    from poliza_recibos r join polizas p on p.id = r.poliza_id
    where r.id = ${reciboId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null`
  if (!r) return false
  const b = borradorReciboDevuelto({
    ramo: r.ramo, compania: r.compania, numeroPoliza: r.numeroPoliza,
    importe: importeEiac(r.importe), vencimiento: r.vencimiento, hoy: new Date(),
  })
  if (!b) return false
  const ins = await tx.$queryRaw<{ id: string }[]>`
    insert into aprobacion (correduria_id, accion, origen, clave, cliente_id, poliza_id, evento_id, propuesta, urgente, caduca_at)
    values (${correduriaId}::uuid, 'enviar_correo_cliente', ${ORIGEN_RECIBO_DEVUELTO},
            ${`${ORIGEN_RECIBO_DEVUELTO}:${reciboId}:${r.vencimiento ?? 'sin_fecha'}`},
            ${r.clienteId}::uuid, ${r.polizaId}::uuid, ${eventoId}::uuid,
            ${JSON.stringify({ asunto: b.asunto, texto: b.texto })}::jsonb, ${b.urgente}, ${caducaEn(new Date())})
    on conflict (clave) do nothing
    returning id::text as id`
  return ins.length > 0
}

export type AprobacionPendiente = {
  id: string
  origen: string
  clienteId: string
  cliente: string | null
  asunto: string
  texto: string
  urgente: boolean
  creada: string
  caduca: string
}

/** Pendientes, urgentes primero. Antes caduca lo vencido: una propuesta vieja no se ejecuta. */
export async function aprobacionesPendientes(correduriaId: string): Promise<AprobacionPendiente[]> {
  const db = prismaAsegura()
  await db.$executeRaw`
    update aprobacion set estado = 'caducada', decidida_at = now(), decidida_por = 'sistema:caducidad'
    where correduria_id = ${correduriaId}::uuid and estado = 'pendiente' and caduca_at < now()`
  const filas = await db.$queryRaw<{ id: string; origen: string; clienteId: string; nombre: string | null; apellidos: string | null; propuesta: { asunto?: unknown; texto?: unknown }; urgente: boolean; creada: Date; caduca: Date }[]>`
    select a.id::text as id, a.origen, a.cliente_id::text as "clienteId", c.nombre, c.apellidos, a.propuesta, a.urgente,
           a.created_at as creada, a.caduca_at as caduca
    from aprobacion a left join clientes c on c.id = a.cliente_id
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'pendiente'
    order by a.urgente desc, a.created_at
    limit 100`
  return filas.map((f) => ({
    id: f.id,
    origen: f.origen,
    clienteId: f.clienteId,
    cliente: [f.nombre, f.apellidos].filter(Boolean).join(' ') || null,
    asunto: typeof f.propuesta?.asunto === 'string' ? f.propuesta.asunto : '',
    texto: typeof f.propuesta?.texto === 'string' ? f.propuesta.texto : '',
    urgente: f.urgente,
    creada: f.creada.toISOString(),
    caduca: f.caduca.toISOString(),
  }))
}

export type ResultadoDecision =
  | { estado: 'ejecutada' | 'rechazada' }
  | { estado: 'no_encontrada' }
  /** Ya no está pendiente (la decidió otro clic, caducó o se está enviando). */
  | { estado: 'ya_decidida' }
  /** La ficha no tiene correo legible: sigue pendiente, no se ha enviado nada. */
  | { estado: 'sin_email' }
  /** No hay proveedor o remitente de correo: sigue pendiente, reintentarlo no lo arregla. */
  | { estado: 'sin_correo_configurado'; motivo: string }
  /** El proveedor rechazó el envío: queda `fallida`. */
  | { estado: 'fallida'; motivo: string }

async function enviarCorreo(destino: string, asunto: string, texto: string): Promise<{ ok: true } | { ok: false; configuracion: boolean; motivo: string }> {
  // Carga perezosa, como en el resto de correos de la app: `@central/core-email` no resuelve con `node --test`.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) return { ok: false, configuracion: true, motivo: 'No hay proveedor de correo configurado en central-asegura.' }
  if (!process.env.ASEGURA_MAIL_FROM?.trim()) return { ok: false, configuracion: true, motivo: 'Falta ASEGURA_MAIL_FROM en central-asegura.' }
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined
  try {
    await transporter.sendMail({ from: remitenteCorreo(process.env.ASEGURA_MAIL_FROM), to: destino, ...(replyTo ? { replyTo } : {}), subject: asunto, text: texto })
    return { ok: true }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    console.error('[aprobaciones] el proveedor rechazó el correo:', m)
    return { ok: false, configuracion: rechazoDeRemitente(m), motivo: rechazoDeRemitente(m) ? 'El dominio del remitente no está verificado en Resend.' : 'El proveedor de correo no aceptó el mensaje.' }
  }
}

export async function decidirAprobacion(correduriaId: string, id: string, d: Decision, actor: string): Promise<ResultadoDecision> {
  if (!UUID.test(id)) return { estado: 'no_encontrada' }
  const db = prismaAsegura()
  const quien = actor.slice(0, 100)
  const [a] = await db.$queryRaw<{ estado: string; clienteId: string; caducada: boolean }[]>`
    select estado, cliente_id::text as "clienteId", caduca_at < now() as caducada
    from aprobacion where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!a) return { estado: 'no_encontrada' }
  if (a.estado !== 'pendiente' || a.caducada) return { estado: 'ya_decidida' }

  if (d.decision === 'rechazar') {
    const n = await db.$executeRaw`
      update aprobacion set estado = 'rechazada', decidida_at = now(), decidida_por = ${quien}
      where id = ${id}::uuid and estado = 'pendiente'`
    if (n === 0) return { estado: 'ya_decidida' }
    anotarCambio({ entidad: 'aprobacion', id, campo: 'estado', antes: 'pendiente', despues: 'rechazada' })
    return { estado: 'rechazada' }
  }

  // Antes de reclamar: sin destinatario no se toca la fila (sigue pendiente para cuando haya correo).
  const destino = await emailDeFicha(correduriaId, a.clienteId)
  if (!destino) return { estado: 'sin_email' }

  // Reclamo atómico: solo una petición pasa de pendiente a enviando.
  const reclamada = await db.$executeRaw`
    update aprobacion set estado = 'enviando', decidida_at = now(), decidida_por = ${quien},
           propuesta = ${JSON.stringify({ asunto: d.asunto, texto: d.texto })}::jsonb
    where id = ${id}::uuid and estado = 'pendiente' and caduca_at >= now()`
  if (reclamada === 0) return { estado: 'ya_decidida' }

  const envio = await enviarCorreo(destino, d.asunto, d.texto)
  if (!envio.ok && envio.configuracion) {
    // No ha salido nada y reintentar no lo arregla: vuelve a pendiente para cuando esté configurado.
    await db.$executeRaw`update aprobacion set estado = 'pendiente', decidida_at = null, decidida_por = null where id = ${id}::uuid and estado = 'enviando'`
    return { estado: 'sin_correo_configurado', motivo: envio.motivo }
  }
  const final = envio.ok ? 'ejecutada' : 'fallida'
  await db.$executeRaw`
    update aprobacion set estado = ${final}, resultado = ${envio.ok ? 'enviado' : envio.motivo}
    where id = ${id}::uuid and estado = 'enviando'`
  anotarCambio({ entidad: 'aprobacion', id, campo: 'estado', antes: 'pendiente', despues: final })
  if (envio.ok) {
    try {
      await db.$executeRaw(Prisma.sql`
        insert into historial_interno (correduria_id, cliente_id, tipo, texto)
        values (${correduriaId}::uuid, ${a.clienteId}::uuid, cast('contacto' as tipo_historial_interno),
                ${`Correo enviado con OK de ${quien}: «${d.asunto}».`})`)
    } catch (e) {
      console.error('[aprobaciones] historial no anotado:', e instanceof Error ? e.message : e)
    }
    return { estado: 'ejecutada' }
  }
  return { estado: 'fallida', motivo: envio.motivo }
}

/**
 * Envíos que se reclamaron y no llegaron a cerrarse (el proceso murió a mitad): NO se sabe si el
 * correo salió, y por eso no se reintentan solos. Se cuentan para que la pantalla lo diga.
 */
export async function enviosInciertos(correduriaId: string): Promise<number> {
  const [r] = await prismaAsegura().$queryRaw<{ n: number }[]>`
    select count(*)::int as n from aprobacion
    where correduria_id = ${correduriaId}::uuid and estado = 'enviando' and decidida_at < now() - interval '10 minutes'`
  return r?.n ?? 0
}
