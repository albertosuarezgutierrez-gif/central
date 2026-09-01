// lib/sivra/extras/orden-limpieza.ts — una ORDEN suelta a la empresa de limpieza.
//
// Hermana de `aviso-limpieza.ts`, y distinta a propósito. Aquélla es la consecuencia de un
// COBRO (la dispara el webhook de Stripe y dice «ya cobrado»); ésta no sabe nada de dinero:
// es Alberto pulsando un botón para que alguien monte una cuna, la haya pagado el huésped por
// Bizum, en efectivo o no la haya pagado en absoluto.
//
// Nació el 01/09/2026 con la reserva 152490601: la huésped pagó los 20€ de la cuna por Bizum,
// el `checkout.session.completed` de Stripe no llegó nunca —porque no hubo Stripe— y la limpieza
// se habría enterado solo si Alberto se acordaba de escribirles a mano. Dictado suyo ese día:
// «no quede fija, pagado ni confirmar ni nada, sino simplemente como una orden, colocar cuna».
//
// 🚨 SI EL EMAIL FALLA, SE OYE. Igual que en el aviso de cobro: la fila guarda el error, salta un
// aviso por Telegram y `enviado_at` se queda NULL. Una orden que no salió NO puede parecerse a
// una orden entregada.
//
// 🚨 Y EL EMAIL NO ES EL CANAL QUE MIRA LA LIMPIEZA (01/09/2026, corregido el mismo día).
// Sique Brilla (Vanesa) ya NO entra en ialimp: su ÚNICO acceso es la intranet
// `/invitado/limpieza`, que lee `limpieza_tareas`. Una orden que solo sale por email es una orden
// invisible para quien tiene que montar la cuna — pasó con la reserva 152490601. Por eso la tarea
// se crea SIEMPRE, antes que el email, y si no se puede crear se declara: la fila queda con
// `tarea_id` NULL y eso significa «la limpieza NO lo ve», nunca «ya está avisada».
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { escapeHtml, tgAviso } from '@/lib/telegram'
import { DESTINO_LIMPIEZA, COPIA_ALBERTO } from './aviso-limpieza'
import { componerOrden, fmtFecha, type DatosOrden } from './orden-texto'

export type { DatosOrden }

export type ResultadoOrden = {
  /** El email salió. */
  ok: boolean
  error?: string
  /** La orden es visible en la intranet de la limpieza (`limpieza_tareas`). */
  enIntranet: boolean
}

/** Manda la orden y la deja registrada. Nunca lanza; tampoco esconde el fallo. */
export async function enviarOrdenLimpieza(
  d: DatosOrden & { bookingId: string; propertyId: string; codigo?: string | null },
): Promise<ResultadoOrden> {
  // 1) LO PRIMERO, la pantalla que mira la limpieza. Si el email fallara después, la orden ya está
  //    donde se trabaja; al revés no se cumple.
  const tareaId = await crearTareaIntranet(d)

  const { asunto, texto } = componerOrden(d)
  const transporter = getTransporter()
  if (!transporter) {
    return await registrarYAvisar(d, tareaId, 'sin proveedor de email configurado (faltan SMTP_*/RESEND_API_KEY/GMAIL_*)')
  }
  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to: DESTINO_LIMPIEZA,
      cc: COPIA_ALBERTO,
      replyTo: COPIA_ALBERTO,
      subject: asunto,
      text: texto,
    })
  } catch (e: unknown) {
    return await registrarYAvisar(d, tareaId, (e as Error)?.message || 'error desconocido al enviar')
  }
  await registrarOrden({ ...d, enviado: true, error: null, tareaId })
  // El email salió pero la orden NO está en su pantalla: hay que decirlo, no darlo por avisado.
  if (!tareaId) await avisarSinIntranet(d, 'el email salió, pero')
  return { ok: true, enIntranet: !!tareaId }
}

/**
 * Crea la tarea que ve la limpieza en `/invitado/limpieza`. Devuelve su id, o `null` si no se pudo
 * (BD caída, fecha ilegible). `null` NO se traga: quien llama lo declara.
 *
 * La fecha es la de ENTRADA del huésped: es el día en el que la cuna tiene que estar puesta, y es
 * el día en el que la limpieza abre su pantalla.
 */
async function crearTareaIntranet(
  d: DatosOrden & { propertyId: string },
): Promise<string | null> {
  const fecha = (d.checkIn || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  try {
    const filas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO limpieza_tareas (fecha, property_id, texto)
      VALUES (${fecha}::date, ${d.propertyId}, ${d.instruccion})
      RETURNING id::text AS id
    `)
    return filas[0]?.id ?? null
  } catch { return null }
}

async function registrarYAvisar(
  d: DatosOrden & { bookingId: string; propertyId: string; codigo?: string | null },
  tareaId: string | null,
  error: string,
): Promise<ResultadoOrden> {
  await registrarOrden({ ...d, enviado: false, error, tareaId })
  // Con la tarea creada el aviso es MENOS grave (la limpieza lo ve igual), y el texto lo dice: si
  // no, Alberto sale corriendo a escribir un email que ya no hace falta.
  await tgAviso('pisos.orden-limpieza',
    `${tareaId ? '⚠️' : '🛑'} <b>Orden a limpieza: el email NO salió</b>\n` +
    `${escapeHtml(d.piso)} · entrada ${fmtFecha(d.checkIn)} · ${escapeHtml(d.titulo)}\n\n` +
    `Motivo: <i>${escapeHtml(error)}</i>\n` +
    (tareaId
      ? `✅ Aun así <b>SÍ aparece en su pantalla</b> (/invitado/limpieza), que es donde miran. No hace falta que hagas nada.`
      : `🛑 Y <b>tampoco está en su pantalla</b>: nadie se ha enterado. Avísales tú.`),
  ).catch(() => {})
  return { ok: false, error, enIntranet: !!tareaId }
}

/** El email salió pero la tarea no se creó: la limpieza NO lo tiene en su pantalla. */
async function avisarSinIntranet(d: DatosOrden, prefijo: string): Promise<void> {
  await tgAviso('pisos.orden-limpieza',
    `⚠️ <b>Orden a limpieza fuera de su pantalla</b>\n` +
    `${escapeHtml(d.piso)} · entrada ${fmtFecha(d.checkIn)} · ${escapeHtml(d.titulo)}\n\n` +
    `${escapeHtml(prefijo)} no se ha podido crear la tarea en /invitado/limpieza, que es lo que ellos miran. ` +
    `Créala a mano desde 🧹 Limpiadoras → Tareas.`,
  ).catch(() => {})
}

async function registrarOrden(p: {
  bookingId: string; propertyId: string; codigo?: string | null
  instruccion: string; enviado: boolean; error: string | null; tareaId: string | null
}): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO sivra_ordenes_limpieza (booking_id, property_id, codigo, instruccion, enviado_at, error, tarea_id)
    VALUES (${p.bookingId}, ${p.propertyId}, ${p.codigo || null}, ${p.instruccion},
            ${p.enviado ? new Date() : null}, ${p.error}, ${p.tareaId}::uuid)
  `).catch(() => {})
}

export type OrdenLimpieza = {
  codigo: string | null
  instruccion: string
  enviado_at: Date | null
  error: string | null
  tarea_id: string | null
}

/**
 * Órdenes de esta reserva, la más reciente primero.
 *
 * 🚨 Devuelve **`null` si NO se ha podido leer** (migración sin aplicar, BD caída) — distinto de
 * `[]` = «leído, no hay ninguna». Quien lo consuma no puede decir «no se ha pedido nada» con un
 * null en la mano: eso sería afirmar una ausencia que nadie ha comprobado.
 */
export async function listarOrdenes(bookingId: string): Promise<OrdenLimpieza[] | null> {
  try {
    return await prisma.$queryRaw<OrdenLimpieza[]>(Prisma.sql`
      SELECT codigo, instruccion, enviado_at, error, tarea_id::text AS tarea_id FROM sivra_ordenes_limpieza
      WHERE booking_id = ${bookingId} ORDER BY created_at DESC LIMIT 20
    `)
  } catch { return null }
}

/**
 * ¿Ya se ENVIÓ una orden de este extra para esta reserva? `null` = no se ha podido comprobar.
 *
 * Una orden que quedó en error NO cuenta como enviada: justo entonces hay que poder repetirla.
 */
export async function ordenYaEnviada(bookingId: string, codigo: string): Promise<boolean | null> {
  const filas = await listarOrdenes(bookingId)
  if (filas === null) return null
  return filas.some(f => f.codigo === codigo && f.enviado_at !== null)
}
