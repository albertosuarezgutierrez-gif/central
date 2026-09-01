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
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { escapeHtml, tgAviso } from '@/lib/telegram'
import { DESTINO_LIMPIEZA, COPIA_ALBERTO } from './aviso-limpieza'
import { componerOrden, fmtFecha, type DatosOrden } from './orden-texto'

export type { DatosOrden }

export type ResultadoOrden = { ok: boolean; error?: string }

/** Manda la orden y la deja registrada. Nunca lanza; tampoco esconde el fallo. */
export async function enviarOrdenLimpieza(
  d: DatosOrden & { bookingId: string; propertyId: string; codigo?: string | null },
): Promise<ResultadoOrden> {
  const { asunto, texto } = componerOrden(d)
  const transporter = getTransporter()
  if (!transporter) {
    return await registrarYAvisar(d, 'sin proveedor de email configurado (faltan SMTP_*/RESEND_API_KEY/GMAIL_*)')
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
    return await registrarYAvisar(d, (e as Error)?.message || 'error desconocido al enviar')
  }
  await registrarOrden({ ...d, enviado: true, error: null })
  return { ok: true }
}

async function registrarYAvisar(
  d: DatosOrden & { bookingId: string; propertyId: string; codigo?: string | null },
  error: string,
): Promise<ResultadoOrden> {
  await registrarOrden({ ...d, enviado: false, error })
  await tgAviso('pisos.orden-limpieza',
    `🛑 <b>Orden a limpieza SIN enviar</b>\n` +
    `${escapeHtml(d.piso)} · entrada ${fmtFecha(d.checkIn)} · ${escapeHtml(d.titulo)}\n\n` +
    `El email a ${escapeHtml(DESTINO_LIMPIEZA)} no salió: <i>${escapeHtml(error)}</i>\n` +
    `Avísales tú y luego lo miramos.`,
  ).catch(() => {})
  return { ok: false, error }
}

async function registrarOrden(p: {
  bookingId: string; propertyId: string; codigo?: string | null
  instruccion: string; enviado: boolean; error: string | null
}): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO sivra_ordenes_limpieza (booking_id, property_id, codigo, instruccion, enviado_at, error)
    VALUES (${p.bookingId}, ${p.propertyId}, ${p.codigo || null}, ${p.instruccion},
            ${p.enviado ? new Date() : null}, ${p.error})
  `).catch(() => {})
}

export type OrdenLimpieza = {
  codigo: string | null
  instruccion: string
  enviado_at: Date | null
  error: string | null
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
      SELECT codigo, instruccion, enviado_at, error FROM sivra_ordenes_limpieza
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
