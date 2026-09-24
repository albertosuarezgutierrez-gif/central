// El ENVÍO del presupuesto al cliente (spec 2026-09-21, §3, PR 3).
//
// Dos canales de aviso, que elige Alberto y que NO se funden:
//   · `email`: lo manda este servidor; el sello `enviado_at` se pone solo si el
//     proveedor lo acepta.
//   · `whatsapp_enlace`: aquí NO sale nada. Se devuelve el texto y un `wa.me` que
//     Alberto abre en su móvil y manda él. Se sella `enlace_generado_at`; el
//     `enviado_at` solo cuando él confirma «ya lo he mandado».
//
// La IDENTIDAD es siempre el correo: el aviso lleva a la carátula del portal, y
// ahí se entra con un código al correo de la ficha. Por eso los dos canales exigen
// que la ficha tenga un correo legible — un WhatsApp a quien no puede recibir el
// código le lleva a una puerta que no abre.
//
// 🔑 El token en claro no se guarda en ningún sitio. Al avisar se genera uno
// NUEVO y se rota el hash con un compare-and-swap sobre el anterior: dos clics
// seguidos no mandan dos correos (el segundo encuentra el hash ya cambiado), y un
// enlace de un aviso anterior deja de abrir, que es lo que se quiere de una llave.
//
// `destino_hash` se deja a NULL a propósito: el portal lo compara con `hashCanal`,
// que usa una pimienta que solo existe allí. Quien entra con el correo de la
// ficha ve el presupuesto por la rama del vínculo (`portal_vinculo.cliente_id`).

import { calcularVencimiento, correoPresupuesto, estadoPresupuesto, mensajePresupuestoWhatsapp, remitenteCorreo } from '@central/module-seguros'
import { generarTokenVista, hashTokenVista } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { datosParaEmitir } from './datos-emision'
import { MOTIVO_REMITENTE, rechazoDeRemitente } from './correo-invitacion-portal'
import { estadoEmailDeFicha } from './email-ficha'
import { estadoPortalDeFicha, nombreDe } from './invitacion-portal'
import { fechaEfectoDe } from './presupuesto'

export type CanalAviso = 'email' | 'whatsapp_enlace'

export type FalloEnvio =
  | 'no_encontrado' | 'no_enviable' | 'sin_enlace' | 'sin_email' | 'sin_acceso' | 'simulado' | 'ocupado'
  | 'sin_proveedor' | 'remitente_no_verificado' | 'rechazado'

export type ResultadoEnvio =
  | { estado: 'enviado'; email: string; venceEl: string }
  | { estado: 'enlace'; mensaje: string; whatsapp: string }
  | { estado: 'confirmado'; venceEl: string }
  | { estado: 'error'; motivo: FalloEnvio; detalle: string }

/** Los estados desde los que se puede (re)avisar. Decidido, elegido o caducado ya no. */
const AVISABLE = new Set(['borrador', 'enlazado', 'enviado', 'visto'])

/** La carátula del portal para ese token. `null` = sin URL https: no se avisa. */
export function enlacePresupuesto(
  token: string,
  base: string | undefined = process.env.ASEGURA_PORTAL_URL ?? 'https://clientes.grupoasegura.es',
): string | null {
  const limpio = base?.trim()
  if (!limpio) return null
  let url: URL
  try {
    url = new URL(limpio)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  url.pathname = `/presupuesto/${token}`
  url.search = ''
  return url.toString()
}

function error(motivo: FalloEnvio, detalle: string): ResultadoEnvio {
  return { estado: 'error', motivo, detalle }
}

const TEXTO_SIN_ACCESO: Record<string, string> = {
  ambiguo: 'Su correo aparece en más de una ficha: en el portal no vería el presupuesto. Resuelve el duplicado primero.',
  resuelve_a_otra: 'Su correo lleva a OTRA ficha: en el portal vería «no es tuyo». Resuelve el duplicado primero.',
  sin_email: 'La ficha no tiene un correo con el que entrar al portal.',
  ilegible: 'El correo de la ficha no se puede descifrar (PII_ENCRYPTION_KEY).',
  no_comprobado: 'No se ha podido comprobar que su correo le lleve a esta ficha en el portal (PII_LOOKUP_KEY o consulta caída). No se avisa a ciegas.',
}

const TEXTO_SIN_EMAIL: Record<string, string> = {
  no_encontrado: 'La ficha del cliente no existe o está fusionada.',
  baja_de_correo: 'El cliente se dio de baja de correo: no se le avisa por ningún canal que lleve a un código por correo.',
  sin_email: 'La ficha no tiene correo, y el presupuesto se abre con un código al correo. Pídele uno y añádelo a su ficha.',
  ilegible: 'El correo de la ficha no se puede descifrar (PII_ENCRYPTION_KEY). Se arregla en Vercel, no llamando al cliente.',
}

export async function avisarPresupuesto(
  correduriaId: string,
  entrada: { id: string; canal: CanalAviso; actor: string },
  ahora: Date = new Date(),
): Promise<ResultadoEnvio> {
  const db = prismaAsegura()
  const p = await db.presupuesto.findFirst({
    where: { id: entrada.id, correduriaId },
    select: {
      id: true, clienteId: true, tarificacionId: true, tokenHash: true, canalAviso: true, creadoAt: true, venceEl: true,
      enlaceGeneradoAt: true, enviadoAt: true, vistoAt: true, elegidoAt: true, aceptadoAt: true, emitidoAt: true, retiradoAt: true,
    },
  })
  if (!p) return error('no_encontrado', 'Ese presupuesto no existe en esta correduría.')
  const estado = estadoPresupuesto(p, ahora)
  if (!AVISABLE.has(estado)) return error('no_enviable', `Está ${estado}: ya no se le avisa. Prepara otro si hace falta.`)

  const [t] = await db.$queryRaw<{ simulado: boolean | null; peticion: unknown }[]>`
    select simulado, peticion from tarificaciones where id = ${p.tarificacionId}::uuid and correduria_id = ${correduriaId}::uuid`
  // Mismo criterio que el trigger de la BD: si no se puede afirmar que es real, no sale.
  if (t?.simulado !== false) return error('simulado', 'Los precios salen de una tarificación simulada: ninguna compañía los ha dado y no se le enseñan a un cliente.')

  const ficha = await estadoEmailDeFicha(correduriaId, p.clienteId)
  if (ficha.estado !== 'ok') return error('sin_email', TEXTO_SIN_EMAIL[ficha.estado] ?? 'No hay un correo al que mandar el código.')
  // El portal enseña el presupuesto por el VÍNCULO con la ficha, y ese vínculo solo se forma si su
  // correo resuelve a ESTA ficha. Avisar a quien luego vería «este presupuesto no es tuyo» es peor
  // que no avisar: misma predicción que la invitación al portal.
  const portal = await estadoPortalDeFicha(correduriaId, p.clienteId)
  if (portal?.estado !== 'invitable' && portal?.estado !== 'ya_entra') {
    return error('sin_acceso', TEXTO_SIN_ACCESO[portal?.estado ?? 'no_comprobado'] ?? TEXTO_SIN_ACCESO.no_comprobado!)
  }
  // Por WhatsApp se le dice con qué correo entrar: solo si se puede afirmar cuál.
  if (entrada.canal === 'whatsapp_enlace' && !portal.emailInvitacion) {
    return error('sin_acceso', 'No se puede afirmar con qué correo entrará, así que por WhatsApp no se le nombra ninguno. Mándalo por correo.')
  }
  const emailAcceso = entrada.canal === 'whatsapp_enlace' ? portal.emailInvitacion! : ficha.email

  const token = generarTokenVista()
  const enlace = enlacePresupuesto(token)
  if (!enlace) return error('sin_enlace', 'Falta ASEGURA_PORTAL_URL o no es https: sin enlace no hay presupuesto que abrir. No se ha tocado nada.')

  const venceSiSale = calcularVencimiento({ creadoAt: p.creadoAt, enviadoAt: p.enviadoAt ?? ahora, fechaEfecto: fechaEfectoDe(t.peticion) }).venceEl
  const nombre = await nombreDe(correduriaId, p.clienteId)
  // Cuántos datos SUYOS faltan para emitir (§4bis): solo el número. Si no se puede leer, no se dice nada.
  const faltanDatos = await datosParaEmitir(correduriaId, p.clienteId).then((r) => r?.faltanCliente ?? null).catch(() => null)
  const datos = { nombre, enlace, venceEl: venceSiSale, email: emailAcceso, faltanDatos }

  // Compare-and-swap sobre el hash anterior: el segundo clic no encuentra la fila.
  const nuevoHash = await hashTokenVista(token)
  const rotado = await db.presupuesto.updateMany({
    where: { id: p.id, correduriaId, tokenHash: p.tokenHash, retiradoAt: null, elegidoAt: null, aceptadoAt: null, emitidoAt: null },
    data: {
      tokenHash: nuevoHash,
      canalAviso: entrada.canal,
      // El WhatsApp promete «válido hasta»: esa fecha se guarda ya, no al confirmar.
      ...(entrada.canal === 'whatsapp_enlace' ? { venceEl: venceSiSale, ...(p.enlaceGeneradoAt === null ? { enlaceGeneradoAt: ahora } : {}) } : {}),
    },
  })
  if (rotado.count === 0) return error('ocupado', 'Otro clic lo está enviando o ha cambiado a la vez. Recarga antes de repetir.')

  if (entrada.canal === 'whatsapp_enlace') {
    const mensaje = mensajePresupuestoWhatsapp(datos)
    await db.presupuestoEvento.create({
      data: { presupuestoId: p.id, tipo: 'enlace_generado', origen: 'corredor', detalle: { actor: entrada.actor, canal: 'whatsapp_enlace' } },
    })
    // Sin número: WhatsApp le deja elegir el chat. El número del hogar no identifica a nadie.
    return { estado: 'enlace', mensaje, whatsapp: `https://wa.me/?text=${encodeURIComponent(mensaje)}` }
  }

  const envio = await mandarCorreo(ficha.email, correoPresupuesto(datos))
  if (envio !== 'enviado') {
    // No salió: se devuelve la llave anterior para que el enlace que el cliente ya tuviera siga abriendo.
    await db.presupuesto.updateMany({ where: { id: p.id, tokenHash: nuevoHash }, data: { tokenHash: p.tokenHash, canalAviso: p.canalAviso } })
    await db.presupuestoEvento.create({
      data: { presupuestoId: p.id, tipo: 'envio_fallido', origen: 'sistema', detalle: { actor: entrada.actor, canal: 'email', motivo: envio } },
    })
    if (envio === 'sin_proveedor') return error('sin_proveedor', 'No hay proveedor de correo configurado en asegura. No ha salido nada.')
    if (envio === 'remitente_no_verificado') return error('remitente_no_verificado', MOTIVO_REMITENTE)
    return error('rechazado', 'El proveedor rechazó el correo. No consta que haya salido; el enlace anterior, si lo había, sigue abriendo.')
  }
  await db.presupuesto.update({
    where: { id: p.id },
    data: {
      ...(p.enviadoAt === null ? { enviadoAt: ahora } : {}),
      venceEl: venceSiSale,
      eventos: { create: [{ tipo: 'enviado', origen: 'corredor', detalle: { actor: entrada.actor, canal: 'email', reenvio: p.enviadoAt !== null } }] },
    },
  })
  return { estado: 'enviado', email: ficha.email, venceEl: venceSiSale.toISOString() }
}

/**
 * Alberto dice que el WhatsApp ya salió de su móvil. Solo sobre un enlace
 * generado y sin envío: no se confirma lo que no se ha abierto.
 */
export async function confirmarWhatsapp(
  correduriaId: string,
  entrada: { id: string; actor: string },
  ahora: Date = new Date(),
): Promise<ResultadoEnvio> {
  const db = prismaAsegura()
  const p = await db.presupuesto.findFirst({
    where: { id: entrada.id, correduriaId },
    select: {
      id: true, canalAviso: true, venceEl: true, enlaceGeneradoAt: true, enviadoAt: true, vistoAt: true,
      elegidoAt: true, aceptadoAt: true, emitidoAt: true, retiradoAt: true,
    },
  })
  if (!p) return error('no_encontrado', 'Ese presupuesto no existe en esta correduría.')
  // Solo un WhatsApp abierto, vigente y cuyo enlace sigue siendo el último: si después se intentó
  // por correo, la llave rotó y lo que se mandó por WhatsApp ya no abre.
  if (estadoPresupuesto(p, ahora) !== 'enlazado' || p.canalAviso !== 'whatsapp_enlace') {
    return error('no_enviable', 'Solo se confirma un WhatsApp abierto, vigente y cuyo enlace no se ha sustituido después.')
  }
  // `venceEl` ya se guardó al abrir WhatsApp: es la fecha que el mensaje prometió.
  const n = await db.presupuesto.updateMany({
    where: { id: p.id, correduriaId, enviadoAt: null, retiradoAt: null, canalAviso: 'whatsapp_enlace' },
    data: { enviadoAt: ahora },
  })
  if (n.count === 0) return error('ocupado', 'Ha cambiado a la vez. Recarga.')
  await db.presupuestoEvento.create({
    data: { presupuestoId: p.id, tipo: 'enviado', origen: 'corredor', detalle: { actor: entrada.actor, canal: 'whatsapp_enlace', confirmado_a_mano: true } },
  })
  return { estado: 'confirmado', venceEl: p.venceEl.toISOString() }
}

type ResultadoCorreo = 'enviado' | 'sin_proveedor' | 'remitente_no_verificado' | 'rechazado'

async function mandarCorreo(destino: string, c: { asunto: string; texto: string; html: string }): Promise<ResultadoCorreo> {
  // Import dinámico: igual que el resto de correos de asegura, para que los cepos
  // con `node --test` puedan cargar el módulo sin resolver `@central/core-email`.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) return 'sin_proveedor'
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined
  try {
    await transporter.sendMail({
      from: remitenteCorreo(process.env.ASEGURA_MAIL_FROM), to: destino, ...(replyTo ? { replyTo } : {}),
      subject: c.asunto, text: c.texto, html: c.html,
    })
    return 'enviado'
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    console.error('[asegura/presupuesto] fallo enviando el aviso:', mensaje)
    return rechazoDeRemitente(mensaje) ? 'remitente_no_verificado' : 'rechazado'
  }
}

/**
 * Alberto marca el presupuesto aceptado como EMITIDO (la compañía ya ha emitido la póliza). Es lo que
 * desbloquea el envío de la anulación de la póliza vieja, si la hubo. Solo sobre uno aceptado.
 */
export async function marcarEmitido(
  correduriaId: string,
  entrada: { id: string; actor: string },
): Promise<{ estado: 'emitido' } | { estado: 'error'; motivo: 'no_encontrado' | 'no_enviable'; detalle: string }> {
  const db = prismaAsegura()
  const n = await db.presupuesto.updateMany({
    where: { id: entrada.id, correduriaId, aceptadoAt: { not: null }, emitidoAt: null, retiradoAt: null },
    data: { emitidoAt: new Date() },
  })
  if (n.count === 0) {
    const existe = await db.presupuesto.findFirst({ where: { id: entrada.id, correduriaId }, select: { id: true } })
    return existe
      ? { estado: 'error', motivo: 'no_enviable', detalle: 'Solo se marca emitido un presupuesto aceptado y aún sin emitir.' }
      : { estado: 'error', motivo: 'no_encontrado', detalle: 'Ese presupuesto no existe en esta correduría.' }
  }
  await db.presupuestoEvento.create({ data: { presupuestoId: entrada.id, tipo: 'emitido', origen: 'corredor', detalle: { actor: entrada.actor } } })
  return { estado: 'emitido' }
}
