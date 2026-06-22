import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { parseCallback, tgAnswerCallback, tgAskForReply, verifyTelegramWebhook } from '@central/core-telegram'
import { enviarAlHuesped } from '@/lib/sivra/agente-huesped/enviar'
import { confirmarEnviado } from '@/lib/sivra/agente-huesped/telegram-msg'
import { aprenderCorreccion, logMensaje } from '@/lib/sivra/agente-huesped/aprender'
import { evaluarGraduacion, graduarCategoria } from '@/lib/sivra/agente-huesped/graduacion'

export const dynamic = 'force-dynamic'

type Pendiente = {
  booking_id: string; property_id: string | null; borrador: string | null
  categoria: string | null; tg_message_id: number | null; esperando_edit: boolean
}

async function getPendiente(bookingId: string): Promise<Pendiente | null> {
  const rows = await prisma.$queryRaw<Pendiente[]>(Prisma.sql`SELECT * FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId} LIMIT 1`)
  return rows[0] || null
}

export async function POST(req: NextRequest) {
  if (!verifyTelegramWebhook(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const body: any = await req.json().catch(() => ({}))

  // A) Pulsación de botón.
  const cb = body.callback_query
  if (cb) {
    const { prefix, action, args } = parseCallback(cb.data || '')
    if (prefix !== 'hsp') return NextResponse.json({ ok: true }) // no es de este agente (bot compartido)
    const bookingId = args[0]
    const pend = bookingId ? await getPendiente(bookingId) : null
    if (!pend) { await tgAnswerCallback(cb.id, 'Ya no está disponible'); return NextResponse.json({ ok: true }) }

    if (action === 'send' || action === 'grant' || action === 'grad') {
      const ok = await enviarAlHuesped(bookingId, pend.borrador || '')
      await tgAnswerCallback(cb.id, ok ? (action === 'grad' ? 'Enviado · categoría graduada ✅' : 'Enviado ✅') : 'Error al enviar')
      await confirmarEnviado(pend.tg_message_id, pend.borrador || '')
      // Aprobado tal cual (sin corregir): la fila de mensajes_log ya está con edited=false.
      await prisma.$executeRaw(Prisma.sql`
        UPDATE mensajes_log SET auto_sent = ${ok}
        WHERE booking_id = ${bookingId}
          AND created_at = (SELECT max(created_at) FROM mensajes_log WHERE booking_id = ${bookingId})
      `).catch(() => {})
      // Graduación: explícita con el botón "a partir de ahora solas", o automática tras N aprobaciones.
      if (pend.categoria) {
        if (action === 'grad') await graduarCategoria(pend.categoria, true)
        else await evaluarGraduacion(pend.categoria)
      }
      await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true })
    }
    if (action === 'edit') {
      await tgAnswerCallback(cb.id, 'Escribe tu respuesta')
      await tgAskForReply(`✏️ Responde a este mensaje con el texto para el huésped (reserva ${bookingId})`)
      await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_pendientes_tg SET esperando_edit = true WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: true })
  }

  // B) Respuesta de texto (force_reply) → modificación. Liga por el booking del texto citado.
  const msg = body.message
  if (msg?.reply_to_message?.text) {
    const m = String(msg.reply_to_message.text).match(/reserva (\w+)/)
    const bookingId = m?.[1]
    const pend = bookingId ? await getPendiente(bookingId) : null
    if (pend && pend.esperando_edit) {
      const texto = msg.text || ''
      const ok = await enviarAlHuesped(bookingId!, texto)
      await aprenderCorreccion({ propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: '', respuestaFinal: texto })
      await logMensaje({ bookingId: bookingId!, propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: '', respuesta: texto, fuente: 'ia', confidence: 0, sentimiento: 'neutro', needs_human: true, auto_sent: ok, edited: true })
      await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true, edited: true })
    }
  }
  return NextResponse.json({ ok: true })
}
