/**
 * Mensajes con el cliente (ASegura OS §Q.7) — el lado del CORREDOR, por el puerto `/api/operador/mensajes`.
 *
 * El cliente escribe en el portal; Alberto lee y contesta desde /correduria (plataforma). Contestar es
 * un clic suyo, así que el aviso por correo al cliente («tienes una respuesta en tu área») sale con ese
 * mismo clic y NO lleva el texto: el contenido se queda en el portal, que es donde hay sesión.
 *
 * 🚨 Toda consulta filtra por `correduria_id` Y `cliente_id`: con un rol BYPASSRLS, un id suelto no
 * falla, contesta en la ficha de otro. La póliza del tema la vigila además la FK compuesta de la BD.
 */
import { remitenteCorreo } from '@central/module-seguros'
import { normalizarCuerpo } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { estadoEmailDeFicha } from './email-ficha'
import { enlacePortal, rechazoDeRemitente, type ResultadoEnvioCorreo } from './correo-invitacion-portal.ts'

export type MensajeCorredor = {
  id: string
  autor: 'cliente' | 'corredor'
  cuerpo: string
  polizaId: string | null
  creadoAt: string
  leidoAt: string | null
  actor: string | null
}

type Fila = {
  id: string
  autor: string
  cuerpo: string
  poliza_id: string | null
  creado_at: Date
  leido_at: Date | null
  actor: string | null
}

function aMensaje(f: Fila): MensajeCorredor {
  return {
    id: f.id,
    autor: f.autor === 'corredor' ? 'corredor' : 'cliente',
    cuerpo: f.cuerpo,
    polizaId: f.poliza_id,
    creadoAt: f.creado_at.toISOString(),
    leidoAt: f.leido_at ? f.leido_at.toISOString() : null,
    actor: f.actor,
  }
}

/** El hilo entero de una ficha, en orden de escritura. */
export async function mensajesDeFicha(correduriaId: string, clienteId: string): Promise<MensajeCorredor[]> {
  const filas = await prismaAsegura().$queryRaw<Fila[]>`
    select id, autor, cuerpo, poliza_id, creado_at, leido_at, actor
    from portal_mensaje
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid
    order by creado_at asc
    limit 500`
  return filas.map(aMensaje)
}

export type PendienteMensaje = {
  clienteId: string
  nombre: string | null
  sinLeer: number
  ultimoAt: string
  ultimo: string
}

/**
 * Las fichas con mensajes del cliente sin leer: la cola de «Hoy». La más antigua primero (espera más).
 * Abrir la ficha NO sella: sella contestar o «no necesita respuesta», para que mirar no lo haga desaparecer.
 * `limit 51`: si vuelven 51, hay más de 50 y la pantalla lo dice en vez de dar un número corto.
 */
export async function mensajesSinLeer(correduriaId: string): Promise<PendienteMensaje[]> {
  const filas = await prismaAsegura().$queryRaw<
    { cliente_id: string; nombre: string | null; sin_leer: bigint; ultimo_at: Date; ultimo: string; primero_at: Date }[]
  >`
    select m.cliente_id,
           nullif(btrim(concat_ws(' ', c.nombre, c.apellidos)), '') as nombre,
           count(*) as sin_leer,
           max(m.creado_at) as ultimo_at,
           min(m.creado_at) as primero_at,
           (array_agg(m.cuerpo order by m.creado_at desc))[1] as ultimo
    from portal_mensaje m
    join clientes c on c.id = m.cliente_id and c.correduria_id = m.correduria_id
    where m.correduria_id = ${correduriaId}::uuid and m.autor = 'cliente' and m.leido_at is null
    group by m.cliente_id, c.nombre, c.apellidos
    order by min(m.creado_at) asc
    limit 51`
  return filas.map((f) => ({
    clienteId: f.cliente_id,
    nombre: f.nombre,
    sinLeer: Number(f.sin_leer),
    ultimoAt: f.ultimo_at.toISOString(),
    ultimo: f.ultimo.length > 160 ? `${f.ultimo.slice(0, 160)}…` : f.ultimo,
  }))
}

/**
 * Sella como leído lo que escribió el cliente en esa ficha HASTA `hasta` (el último que vio el
 * corredor en pantalla). Lo que entre después no se sella: nadie lo ha visto. Devuelve cuántos.
 */
export async function marcarLeidos(correduriaId: string, clienteId: string, hasta: Date): Promise<number> {
  return prismaAsegura().$executeRaw`
    update portal_mensaje set leido_at = now()
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid
      and autor = 'cliente' and leido_at is null
      -- +1 ms: hasta viaja en ISO (milisegundos) y creado_at guarda microsegundos; sin él, el último no se sella.
      and creado_at < ${hasta}::timestamptz + interval '1 millisecond'`
}

export type ResultadoRespuesta =
  | { estado: 'enviado'; id: string; aviso: AvisoRespuesta }
  | { estado: 'invalido' }
  | { estado: 'no_encontrado' }
  | { estado: 'poliza_no_valida' }

/** Qué pasó con el correo al cliente. Cualquier cosa distinta de `enviado` NO borra la respuesta: ya está guardada. */
export type AvisoRespuesta = ResultadoEnvioCorreo | 'no_pedido' | 'sin_email' | 'baja_de_correo' | 'ilegible' | 'sin_enlace'

/**
 * Guarda la respuesta del corredor, da por leído lo que escribió el cliente hasta `hasta` (lo que
 * tenía en pantalla; `null` = no sella nada) y, si se pide, le avisa por correo.
 */
export async function responder(
  correduriaId: string,
  clienteId: string,
  polizaId: string | null,
  cuerpoCrudo: unknown,
  actor: string,
  avisar: boolean,
  hasta: Date | null,
): Promise<ResultadoRespuesta> {
  const cuerpo = normalizarCuerpo(cuerpoCrudo)
  if (cuerpo === null || !actor.trim()) return { estado: 'invalido' }
  const db = prismaAsegura()
  const existe = await db.$queryRaw<{ id: string }[]>`
    select id from clientes where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null`
  if (existe.length === 0) return { estado: 'no_encontrado' }

  let id: string
  try {
    const filas = await db.$queryRaw<{ id: string }[]>`
      insert into portal_mensaje (correduria_id, cliente_id, poliza_id, autor, actor, cuerpo)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid, 'corredor', ${actor.slice(0, 200)}, ${cuerpo})
      returning id`
    id = filas[0].id
  } catch (e) {
    // 23503 = la FK compuesta: la póliza no es de esta ficha (Prisma lo envuelve en P2010).
    const err = e as { meta?: { code?: string }; message?: string }
    if (err.meta?.code === '23503' || /23503|foreign key/i.test(err.message ?? '')) return { estado: 'poliza_no_valida' }
    throw e
  }
  if (hasta) await marcarLeidos(correduriaId, clienteId, hasta)

  let aviso: AvisoRespuesta = 'no_pedido'
  if (avisar) aviso = await avisarAlCliente(correduriaId, clienteId)
  return { estado: 'enviado', id, aviso }
}

async function avisarAlCliente(correduriaId: string, clienteId: string): Promise<AvisoRespuesta> {
  const destino = await estadoEmailDeFicha(correduriaId, clienteId)
  if (destino.estado === 'no_encontrado' || destino.estado === 'sin_email') return 'sin_email'
  if (destino.estado !== 'ok') return destino.estado
  const enlace = enlacePortal()
  if (!enlace) return 'sin_enlace'
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) return 'sin_proveedor'
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined
  const texto = [
    'Hola:',
    '',
    'Tu corredor te ha contestado en Mis Seguros, el área de clientes de Grupo ASegura.',
    'Por seguridad no copiamos aquí el mensaje: entra para leerlo.',
    '',
    enlace.replace(/\/boveda$/, '/mensajes'),
  ].join('\n')
  try {
    await transporter.sendMail({
      from: remitenteCorreo(process.env.ASEGURA_MAIL_FROM),
      to: destino.email,
      ...(replyTo ? { replyTo } : {}),
      subject: 'Tienes una respuesta de tu corredor',
      text: texto,
    })
    return 'enviado'
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    console.error('[asegura/mensajes] fallo enviando el aviso de respuesta:', mensaje)
    return rechazoDeRemitente(mensaje) ? 'remitente_no_verificado' : 'rechazado'
  }
}
