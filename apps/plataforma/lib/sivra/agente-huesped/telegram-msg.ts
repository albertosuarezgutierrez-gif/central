// lib/sivra/agente-huesped/telegram-msg.ts — propuesta por Telegram + estado pendiente.
import { tgSendButtons, tgEditMessage, escapeHtml, type Boton } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Decision } from './decidir'
import type { Contexto } from './contexto'

const EMOJI = (urgente: boolean) => (urgente ? '🔴' : '💬')

// Propone el borrador por Telegram con botones y guarda el estado pendiente (liga el booking).
export async function proponerPorTelegram(ctx: Contexto, pregunta: string, dec: Decision): Promise<void> {
  const urgente = dec.sentimiento === 'negativo'
  const cabecera = `${EMOJI(urgente)} <b>${escapeHtml(ctx.property)}</b> · ${escapeHtml(ctx.guestName)} (reserva ${ctx.bookingId})`
  const cuerpo = `<b>Huésped:</b> ${escapeHtml(pregunta)}\n\n<b>Borrador:</b>\n${escapeHtml(dec.reply || '(sin borrador — escribe tú con Modificar)')}` +
    (dec.motivo ? `\n\n<i>${escapeHtml(dec.motivo)}</i>` : '')

  const botones: Boton[][] = [[
    { texto: '✅ Enviar', callback: `hsp_send:${ctx.bookingId}` },
    { texto: '✏️ Modificar', callback: `hsp_edit:${ctx.bookingId}` },
  ]]
  // Acción contextual: conceder late/early si la categoría lo pide.
  if (dec.categoria === 'late_checkout' || dec.categoria === 'early_checkin') {
    botones.push([{ texto: '🕒 Conceder', callback: `hsp_grant:${ctx.bookingId}` }])
  }

  const mid = await tgSendButtons(`${cabecera}\n\n${cuerpo}`, botones)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_pendientes_tg (booking_id, property_id, borrador, categoria, tg_message_id, esperando_edit)
    VALUES (${ctx.bookingId}, ${ctx.propertyId}, ${dec.reply || ''}, ${dec.categoria}, ${mid}, false)
    ON CONFLICT (booking_id) DO UPDATE SET borrador = ${dec.reply || ''}, categoria = ${dec.categoria}, tg_message_id = ${mid}, esperando_edit = false, created_at = now()
  `).catch(() => {})
}

export async function confirmarEnviado(messageId: number | null, texto: string): Promise<void> {
  if (messageId) await tgEditMessage(messageId, `✅ Enviado al huésped:\n\n${escapeHtml(texto)}`)
}
