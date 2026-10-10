// El ENVÍO del presupuesto al cliente (spec 2026-09-21, §3, PR 3).
//
// Dos canales de aviso, que elige Alberto y que NO se funden:
//   · `email`: lo manda este servidor; el sello `enviado_at` se pone solo si el
//     proveedor lo acepta.
//   · `whatsapp_enlace`: aquí NO sale nada. Se devuelve el texto y un `wa.me` que
//     Alberto abre en su móvil y manda él. Se sella `enlace_generado_at`; el
//     `enviado_at` solo cuando él confirma «ya lo he mandado».
//
// La puerta del portal es un CÓDIGO:
//   · por correo, el de un solo uso que pide la persona en la carátula (exige que su
//     correo resuelva a ESTA ficha: si no, vería «no es tuyo»);
//   · por WhatsApp (07/10/2026), además, un código de 6 dígitos propio de este
//     presupuesto que va EN el mensaje (`presupuesto-codigo-whatsapp.ts`), hasheado y
//     atado al token: regenerar el enlace = código nuevo, y avisar por correo lo borra.
//     Así el WhatsApp sale también a quien NO tiene correo, si hay un móvil válido en
//     la ficha. Sin correo afirmable y sin móvil: no se avisa (una puerta que no abre).
//
// 🔑 El token en claro no se guarda en ningún sitio. Al avisar se genera uno
// NUEVO y se rota el hash con un compare-and-swap sobre el anterior: dos clics
// seguidos no mandan dos correos (el segundo encuentra el hash ya cambiado), y un
// enlace de un aviso anterior deja de abrir, que es lo que se quiere de una llave.
//
// `destino_hash` se deja a NULL a propósito: el portal lo compara con `hashCanal`,
// que usa una pimienta que solo existe allí. Quien entra con el correo de la
// ficha ve el presupuesto por la rama del vínculo (`portal_vinculo.cliente_id`).

import { calcularVencimiento, correoPresupuesto, estadoPresupuesto, mensajePresupuestoWhatsapp } from '@central/module-seguros'
import { generarCodigo, generarTokenVista, hashCodigoWhatsapp, hashTokenVista } from '@central/module-seguros-portal'

import { computeEmailLookupHash } from '@central/module-seguros-pii'

import { prismaAsegura } from './asegura-db'
import { crearEnlaceDirecto } from './avisos-intranet'
import { datosParaEmitir } from './datos-emision'
import { MOTIVO_REMITENTE, rechazoDeRemitente } from './correo-invitacion-portal'
import { estadoEmailDeFicha } from './email-ficha'
import { estadoPortalDeFicha, nombreDe } from './invitacion-portal'
import { fechaEfectoDe } from './presupuesto'
import { admiteCodeoscopic, decidirSalida } from './presupuesto-origen'
import { movilDeFicha } from './presupuesto-codigo-whatsapp'
import type { BarreraLote, ResultadoCorreoLote } from './barrera-lote'

export type CanalAviso = 'email' | 'whatsapp_enlace'

export type FalloEnvio =
  | 'no_encontrado' | 'no_enviable' | 'sin_necesidades' | 'sin_enlace' | 'sin_email' | 'sin_acceso' | 'simulado' | 'ocupado'
  /** Origen `ofertas`: alguna opción no sale de una oferta REVISADA. `origen_desconocido`: no se sabe de dónde salen los precios. */
  | 'sin_revisar' | 'origen_desconocido'
  | 'sin_proveedor' | 'remitente_no_verificado' | 'rechazado'
  /** Aviso de un LOTE (propuesta de escenarios): otro presupuesto del lote no pudo salir, así que no sale ninguno. */
  | 'lote_cancelado'

/**
 * Lo que un presupuesto aporta al correo ÚNICO de su lote (`lib/barrera-lote.ts`): su enlace y a quién va.
 * Se une a la barrera EXACTAMENTE donde mandaría su correo (tras el compare-and-swap y la llave directa).
 */
export type ParteLote = { presupuestoId: string; clienteId: string; email: string; nombre: string | null; enlace: string; venceEl: Date }

export type ResultadoEnvio =
  | { estado: 'enviado'; email: string; venceEl: string }
  /**
   * `enlace`, `email` y `venceEl` van aparte para que el LOTE componga un único mensaje con varios escenarios.
   * `email` null = por WhatsApp no se le nombra ningún correo (entra con el código que va en `mensaje`).
   * `codigo` es el código de acceso de ESTE enlace (el mismo que ya va en `mensaje`): el lote lo pone junto a su enlace.
   */
  | { estado: 'enlace'; mensaje: string; whatsapp: string; enlace: string; email: string | null; venceEl: string; codigo: string }
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

type ErrorEnvio = Extract<ResultadoEnvio, { estado: 'error' }>

function error(motivo: FalloEnvio, detalle: string): ErrorEnvio {
  return { estado: 'error', motivo, detalle }
}

const TEXTO_SIN_ACCESO: Record<string, string> = {
  ambiguo: 'Su correo aparece en más de una ficha: en el portal no vería el presupuesto. Resuelve el duplicado primero.',
  resuelve_a_otra: 'Su correo lleva a OTRA ficha: en el portal vería «no es tuyo». Resuelve el duplicado primero.',
  sin_email: 'La ficha no tiene un correo con el que entrar al portal.',
  ilegible: 'El correo de la ficha no se puede descifrar (PII_ENCRYPTION_KEY).',
  no_comprobado: 'No se ha podido comprobar que su correo le lleve a esta ficha en el portal (PII_LOOKUP_KEY o consulta caída). No se avisa a ciegas.',
}

const TEXTO_SIN_MOVIL = 'Y no tiene un móvil válido (6xx/7xx) al que mandarle el código por WhatsApp.'
const TEXTO_SIN_CORREO_NI_MOVIL =
  'La ficha no tiene un correo con el que entrar ni un móvil válido (6xx/7xx) al que mandarle el código. Añade uno de los dos a su ficha.'
const TEXTO_SIN_MOVIL_ILEGIBLE =
  'El correo o el teléfono de la ficha no se pueden descifrar (PII_ENCRYPTION_KEY). Se arregla en Vercel, no llamando al cliente.'

const TEXTO_SIN_EMAIL: Record<string, string> = {
  no_encontrado: 'La ficha del cliente no existe o está fusionada.',
  baja_de_correo: 'El cliente se dio de baja de correo: no se le avisa por ningún canal que lleve a un código por correo.',
  sin_email: 'La ficha no tiene correo, y el presupuesto se abre con un código al correo. Pídele uno y añádelo a su ficha.',
  ilegible: 'El correo de la ficha no se puede descifrar (PII_ENCRYPTION_KEY). Se arregla en Vercel, no llamando al cliente.',
}

type EntradaAviso = { id: string; canal: CanalAviso; actor: string }

export async function avisarPresupuesto(
  correduriaId: string,
  entrada: EntradaAviso & {
    /** Solo correo: este presupuesto es parte de un LOTE y su correo sale JUNTO con el de los demás (uno solo). */
    lote?: BarreraLote<ParteLote>
  },
  ahora: Date = new Date(),
): Promise<ResultadoEnvio> {
  const prep = await prepararAviso(correduriaId, entrada, ahora)
  if (prep.estado === 'error') return prep
  return ejecutarAviso(prep, entrada.lote ?? null)
}

function leerFilaAviso(correduriaId: string, id: string) {
  return prismaAsegura().presupuesto.findFirst({
    where: { id, correduriaId },
    select: {
      id: true, clienteId: true, tarificacionId: true, origen: true, oportunidadId: true, tokenHash: true, canalAviso: true, creadoAt: true, venceEl: true,
      whatsappCodigoHash: true, whatsappCodigoIntentos: true,
      enlaceGeneradoAt: true, enviadoAt: true, vistoAt: true, elegidoAt: true, aceptadoAt: true, emitidoAt: true, retiradoAt: true,
      necesidades: true,
    },
  })
}

/**
 * Un aviso que ha pasado TODAS las guardas y aún no ha escrito nada: token, código y enlace ya generados
 * en memoria. El LOTE prepara todos sus presupuestos antes de que ninguno rote su llave (`propuesta-escenarios.ts`).
 */
export type AvisoPreparado = {
  estado: 'preparado'
  correduriaId: string
  entrada: EntradaAviso
  ahora: Date
  p: NonNullable<Awaited<ReturnType<typeof leerFilaAviso>>>
  token: string
  codigoWhatsapp: string | null
  enlace: string
  venceSiSale: Date
  nombre: string | null
  emailAcceso: string | null
  datos: { nombre: string | null; enlace: string; venceEl: Date; email: string | null; faltanDatos: number | null }
}

/** Fase 1: SOLO LEE. Todas las guardas; ninguna escritura. */
export async function prepararAviso(correduriaId: string, entrada: EntradaAviso, ahora: Date = new Date()): Promise<AvisoPreparado | ErrorEnvio> {
  const db = prismaAsegura()
  const p = await leerFilaAviso(correduriaId, entrada.id)
  if (!p) return error('no_encontrado', 'Ese presupuesto no existe en esta correduría.')
  const estado = estadoPresupuesto(p, ahora)
  if (!AVISABLE.has(estado)) return error('no_enviable', `Está ${estado}: ya no se le avisa. Prepara otro si hace falta.`)
  // IDD (art. 20 Ley 16/2018): las necesidades del cliente se especifican ANTES de proponerle nada.
  if (!p.necesidades?.trim()) return error('sin_necesidades', 'Antes de avisarle, escribe sus exigencias y necesidades: qué quiere asegurar y qué le importa. Es lo que luego firma con la aceptación.')

  // Mismo criterio que el trigger de la BD (`presupuesto_no_enviar_simulado`), por ORIGEN:
  //   · codeoscopic → su tarificación tiene que ser real (si no se puede afirmar, no sale);
  //   · ofertas     → SIN tarificación: toda opción visible sale de una oferta REVISADA de su oportunidad.
  // 🚨 Un presupuesto de ofertas no consulta `tarificaciones` (no tiene): la puerta es `admiteCodeoscopic`.
  let t: { simulado: boolean | null; peticion: unknown } | undefined
  let opcionesOfertas: { ofertaId: string | null; estadoOferta: string | null; mismaOportunidad: boolean }[] | null = null
  if (admiteCodeoscopic(p)) {
    ;[t] = await db.$queryRaw<{ simulado: boolean | null; peticion: unknown }[]>`
      select simulado, peticion from tarificaciones where id = ${p.tarificacionId}::uuid and correduria_id = ${correduriaId}::uuid`
  } else if (p.origen === 'ofertas') {
    opcionesOfertas = (await db.$queryRaw<{ oferta_id: string | null; estado: string | null; misma: boolean }[]>`
      select o.oferta_id::text as oferta_id, f.estado, coalesce(f.oportunidad_id = ${p.oportunidadId}::uuid and f.correduria_id = ${correduriaId}::uuid, false) as misma
      from (select oferta_id from presupuesto_opcion where presupuesto_id = ${p.id}::uuid and oculta_at is null) o
      left join oportunidad_oferta f on f.id = o.oferta_id`).map((o) => ({ ofertaId: o.oferta_id, estadoOferta: o.estado, mismaOportunidad: o.misma }))
  }
  const salida = decidirSalida(p, { simulado: t?.simulado ?? null, opciones: opcionesOfertas })
  if (!salida.ok) return error(salida.motivo, salida.detalle)

  const ficha = await estadoEmailDeFicha(correduriaId, p.clienteId)
  // El correo con el que se le dice que puede entrar. `null` (solo por WhatsApp) = no se nombra ninguno.
  let emailAcceso: string | null
  if (entrada.canal === 'email') {
    if (ficha.estado !== 'ok') return error('sin_email', TEXTO_SIN_EMAIL[ficha.estado] ?? 'No hay un correo al que mandar el código.')
    // El portal enseña el presupuesto por el VÍNCULO con la ficha, y ese vínculo solo se forma si su
    // correo resuelve a ESTA ficha. Avisar a quien luego vería «este presupuesto no es tuyo» es peor
    // que no avisar: misma predicción que la invitación al portal.
    const portal = await estadoPortalDeFicha(correduriaId, p.clienteId)
    if (portal?.estado !== 'invitable' && portal?.estado !== 'ya_entra') {
      return error('sin_acceso', TEXTO_SIN_ACCESO[portal?.estado ?? 'no_comprobado'] ?? TEXTO_SIN_ACCESO.no_comprobado!)
    }
    emailAcceso = ficha.email
  } else {
    // Por WhatsApp se entra con el código del propio mensaje. El correo se le nombra como
    // alternativa SOLO si se puede afirmar que le lleva a esta ficha; si no, hace falta un móvil.
    const portal = ficha.estado === 'ok' ? await estadoPortalDeFicha(correduriaId, p.clienteId) : null
    const conCorreo = (portal?.estado === 'invitable' || portal?.estado === 'ya_entra') && portal.emailInvitacion ? portal.emailInvitacion : null
    if (conCorreo === null) {
      const movil = await movilDeFicha(correduriaId, p.clienteId)
      if (movil !== 'ok') {
        if (ficha.estado === 'no_encontrado' || movil === 'no_encontrado') return error('sin_email', TEXTO_SIN_EMAIL.no_encontrado!)
        if (ficha.estado === 'ilegible' || movil === 'ilegible') return error('sin_email', TEXTO_SIN_MOVIL_ILEGIBLE)
        if (ficha.estado === 'ok') {
          return error('sin_acceso', `${TEXTO_SIN_ACCESO[portal?.estado ?? 'no_comprobado'] ?? TEXTO_SIN_ACCESO.no_comprobado!} ${TEXTO_SIN_MOVIL}`)
        }
        return error('sin_email', TEXTO_SIN_CORREO_NI_MOVIL)
      }
    }
    emailAcceso = conCorreo
  }

  const token = generarTokenVista()
  // El código de acceso del WhatsApp: nuevo en cada enlace. Solo se guarda su hash, atado al token.
  const codigoWhatsapp = entrada.canal === 'whatsapp_enlace' ? generarCodigo() : null
  const enlace = enlacePresupuesto(token)
  if (!enlace) return error('sin_enlace', 'Falta ASEGURA_PORTAL_URL o no es https: sin enlace no hay presupuesto que abrir. No se ha tocado nada.')

  const venceSiSale = calcularVencimiento({ creadoAt: p.creadoAt, enviadoAt: p.enviadoAt ?? ahora, fechaEfecto: fechaEfectoDe(t?.peticion ?? null) }).venceEl
  const nombre = await nombreDe(correduriaId, p.clienteId)
  // Cuántos datos SUYOS faltan para emitir (§4bis): solo el número. Si no se puede leer, no se dice nada.
  // En un presupuesto de ofertas no se dice: esos datos son los de la emisión por Avant2, que aquí no hay.
  const faltanDatos = salida.via === 'ofertas'
    ? null
    : await datosParaEmitir(correduriaId, p.clienteId).then((r) => r?.faltanCliente ?? null).catch(() => null)
  const datos = { nombre, enlace, venceEl: venceSiSale, email: emailAcceso, faltanDatos }
  return {
    estado: 'preparado', correduriaId, entrada: { id: entrada.id, canal: entrada.canal, actor: entrada.actor }, ahora,
    p, token, codigoWhatsapp, enlace, venceSiSale, nombre, emailAcceso, datos,
  }
}

/** Lo que `ejecutarAviso` escribe: el cliente de siempre o la transacción del lote de WhatsApp. */
export type DbAviso = Pick<ReturnType<typeof prismaAsegura>, 'presupuesto' | 'presupuestoEvento'>

/**
 * Fase 2: escribe. Compare-and-swap del token y, según canal, sello del enlace o envío del correo.
 * `lote`: solo correo, se une a la barrera en vez de mandar el suyo. `db`: el lote de WhatsApp pasa su
 * transacción, para que un compare-and-swap perdido deshaga las rotaciones de los demás.
 */
export async function ejecutarAviso(prep: AvisoPreparado, lote: BarreraLote<ParteLote> | null = null, db: DbAviso = prismaAsegura()): Promise<ResultadoEnvio> {
  const { correduriaId, entrada, ahora, p, token, codigoWhatsapp, enlace, venceSiSale, nombre, emailAcceso, datos } = prep

  // Compare-and-swap sobre el hash anterior: el segundo clic no encuentra la fila.
  const nuevoHash = await hashTokenVista(token)
  const nuevoCodigoHash = codigoWhatsapp === null ? null : await hashCodigoWhatsapp(token, codigoWhatsapp)
  const rotado = await db.presupuesto.updateMany({
    where: { id: p.id, correduriaId, tokenHash: p.tokenHash, retiradoAt: null, elegidoAt: null, aceptadoAt: null, emitidoAt: null },
    data: {
      tokenHash: nuevoHash,
      // El código va CON el token: regenerar el enlace = código nuevo; avisar por correo lo borra.
      whatsappCodigoHash: nuevoCodigoHash,
      whatsappCodigoIntentos: 0,
      canalAviso: entrada.canal,
      // El WhatsApp promete «válido hasta»: esa fecha se guarda ya, no al confirmar.
      ...(entrada.canal === 'whatsapp_enlace' ? { venceEl: venceSiSale, ...(p.enlaceGeneradoAt === null ? { enlaceGeneradoAt: ahora } : {}) } : {}),
    },
  })
  if (rotado.count === 0) return error('ocupado', 'Otro clic lo está enviando o ha cambiado a la vez. Recarga antes de repetir.')

  if (entrada.canal === 'whatsapp_enlace') {
    const mensaje = mensajePresupuestoWhatsapp({ ...datos, codigo: codigoWhatsapp! })
    await db.presupuestoEvento.create({
      data: { presupuestoId: p.id, tipo: 'enlace_generado', origen: 'corredor', detalle: { actor: entrada.actor, canal: 'whatsapp_enlace' } },
    })
    // Sin número: WhatsApp le deja elegir el chat. El número del hogar no identifica a nadie.
    return { estado: 'enlace', mensaje, whatsapp: `https://wa.me/?text=${encodeURIComponent(mensaje)}`, enlace, email: emailAcceso, venceEl: venceSiSale.toISOString(), codigo: codigoWhatsapp! }
  }

  // Acceso directo a la intranet (un solo uso, 24 h): el botón entra sin código y cae en la carátula,
  // que con sesión lleva al presupuesto. Si no se puede atar al correo, va el enlace de siempre.
  // Por correo `emailAcceso` es SIEMPRE el de la ficha: sin él se cortó arriba, antes de escribir.
  const correo = emailAcceso as string
  const directo = await enlaceDirectoPresupuesto(correduriaId, p.clienteId, correo, enlace)
  const envio = await mandarCorreo(correduriaId, p.clienteId, 'presupuesto_aviso', correo, correoPresupuesto({ ...datos, enlaceDirecto: directo }),
    lote ? { barrera: lote, parte: { presupuestoId: p.id, clienteId: p.clienteId, email: correo, nombre, enlace: directo ?? enlace, venceEl: venceSiSale } } : null)
  if (envio !== 'enviado') {
    // No salió: se devuelve la llave anterior para que el enlace que el cliente ya tuviera siga abriendo.
    await db.presupuesto.updateMany({ where: { id: p.id, tokenHash: nuevoHash }, data: { tokenHash: p.tokenHash, canalAviso: p.canalAviso, whatsappCodigoHash: p.whatsappCodigoHash, whatsappCodigoIntentos: p.whatsappCodigoIntentos } })
    await db.presupuestoEvento.create({
      data: { presupuestoId: p.id, tipo: 'envio_fallido', origen: 'sistema', detalle: { actor: entrada.actor, canal: 'email', motivo: envio } },
    })
    if (envio === 'sin_proveedor') return error('sin_proveedor', 'No hay proveedor de correo configurado en asegura. No ha salido nada.')
    if (envio === 'remitente_no_verificado') return error('remitente_no_verificado', MOTIVO_REMITENTE)
    if (envio === 'cancelado') return error('lote_cancelado', 'Otro escenario de la propuesta no se podía avisar, así que no ha salido ninguno. Este presupuesto está como estaba.')
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
  return { estado: 'enviado', email: correo, venceEl: venceSiSale.toISOString() }
}

/**
 * La llave de acceso directo del correo, con destino la carátula de ESTE presupuesto. `null` = no se
 * pudo atar al correo (sin `PII_LOOKUP_KEY`) o guardar: el correo sale con el enlace de siempre.
 */
async function enlaceDirectoPresupuesto(correduriaId: string, clienteId: string, correo: string, caratula: string): Promise<string | null> {
  let hash: string | null = null
  try {
    hash = computeEmailLookupHash(correo)
  } catch {
    hash = null
  }
  if (!hash) return null
  const u = new URL(caratula)
  const r = await crearEnlaceDirecto(correduriaId, clienteId, correo, hash, u.pathname, u.origin).catch(() => null)
  return r?.directo ? r.enlace : null
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

type ResultadoCorreo = ResultadoCorreoLote

async function mandarCorreo(
  correduriaId: string, clienteId: string, tipo: string, destino: string, c: { asunto: string; texto: string; html: string },
  lote: { barrera: BarreraLote<ParteLote>; parte: ParteLote } | null = null,
): Promise<ResultadoCorreo> {
  // Parte de un lote: el correo individual NO sale; sale el del lote, una vez, cuando se han unido todos.
  if (lote) return lote.barrera.unirse(lote.parte)
  // Import dinámico: igual que el resto de correos de asegura, para que los cepos
  // con `node --test` puedan cargar el módulo sin resolver `@central/core-email`.
  const { enviarCorreoSeguido } = await import('./correo-envio')
  const r = await enviarCorreoSeguido({ correduriaId, clienteId, tipo, to: destino, asunto: c.asunto, texto: c.texto, html: c.html })
  if (r.resultado === 'enviado') return 'enviado'
  if (r.resultado === 'sin_proveedor') return 'sin_proveedor'
  console.error('[asegura/presupuesto] fallo enviando el aviso:', r.motivo)
  return rechazoDeRemitente(r.motivo ?? '') ? 'remitente_no_verificado' : 'rechazado'
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
