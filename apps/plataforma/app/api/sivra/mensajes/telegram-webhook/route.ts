import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { parseCallback, tgAnswerCallback, tgAskForReply, tgSend, escapeHtml, verifyTelegramWebhook } from '@central/core-telegram'
import { aiComplete } from '@central/core-ai'
import { enviarAlHuesped } from '@/lib/sivra/agente-huesped/enviar'
import { confirmarEnviado, confirmarDescartado, reproponerBorrador } from '@/lib/sivra/agente-huesped/telegram-msg'
import { aprenderCorreccion } from '@/lib/sivra/agente-huesped/aprender'
import { evaluarGraduacion, graduarCategoria } from '@/lib/sivra/agente-huesped/graduacion'
import { aplicarRetoque } from '@/lib/sivra/agente-huesped/retoque'

export const dynamic = 'force-dynamic'

const NOMBRE_IDIOMA: Record<string, string> = { en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano' }

type Pendiente = {
  booking_id: string; property_id: string | null; borrador: string | null
  categoria: string | null; tg_message_id: number | null; esperando_edit: boolean; idioma: string | null
  esperando_retoque: boolean; pregunta: string | null
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
      await tgAnswerCallback(cb.id, ok ? (action === 'grad' ? 'Enviado · categoría graduada ✅' : 'Enviado ✅') : 'No se pudo enviar — reintenta')
      // Si el envío FALLA, NO tocamos nada (dejamos el pendiente y los botones para reintentar).
      if (!ok) {
        await tgSend('❌ No se pudo enviar al huésped. Vuelve a darle a ✅ Enviar en un momento.')
        return NextResponse.json({ ok: false, sent: false })
      }
      await confirmarEnviado(pend.tg_message_id, pend.borrador || '')
      // Aprobado tal cual (sin corregir): la fila de mensajes_log ya está con edited=false.
      await prisma.$executeRaw(Prisma.sql`
        UPDATE mensajes_log SET auto_sent = true
        WHERE booking_id = ${bookingId}
          AND created_at = (SELECT max(created_at) FROM mensajes_log WHERE booking_id = ${bookingId})
      `).catch(() => {})
      // El agente aprende de TODAS las respuestas de Alberto, no solo de las correcciones: un borrador
      // aprobado tal cual es un ejemplo de tono/criterio igual de válido para ese piso (lo lee contexto.ts).
      await aprenderCorreccion({ propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: pend.pregunta || '', respuestaFinal: pend.borrador || '' })
      // Graduación: explícita con el botón "a partir de ahora solas", o automática tras N aprobaciones.
      if (pend.categoria) {
        if (action === 'grad') await graduarCategoria(pend.categoria, true)
        else await evaluarGraduacion(pend.categoria)
      }
      await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true })
    }
    if (action === 'skip') {
      // Cierre de conversación (gracias/perfecto…): se cierra sin enviar nada al huésped.
      await tgAnswerCallback(cb.id, 'Descartado — sin respuesta')
      await confirmarDescartado(pend.tg_message_id)
      await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true, skipped: true })
    }
    if (action === 'edit') {
      await tgAnswerCallback(cb.id, 'Escribe tu respuesta')
      await tgAskForReply(`✏️ Responde a este mensaje con el texto para el huésped (reserva ${bookingId})`)
      await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_pendientes_tg SET esperando_edit = true, esperando_retoque = false WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true })
    }
    if (action === 'tune') {
      await tgAnswerCallback(cb.id, 'Escribe el retoque')
      await tgAskForReply(`🔧 Responde con el RETOQUE a aplicar al borrador (p. ej. "añade que la cafetera es italiana") — reserva ${bookingId}`)
      await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_pendientes_tg SET esperando_retoque = true, esperando_edit = false WHERE booking_id = ${bookingId}`).catch(() => {})
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
    if (pend && pend.esperando_retoque) {
      const instruccion = (msg.text || '').trim()
      const texto = await aplicarRetoque(pend.borrador || '', instruccion, pend.idioma || 'es')
      if (!texto) {
        await tgSend('❌ No pude aplicar el retoque. Vuelve a pulsar 🔧 Retocar e indícamelo de nuevo (o ✏️ Modificar para reescribir).')
        return NextResponse.json({ ok: false, tuned: false })
      }
      // No se envía aún: se re-propone el borrador retocado para que Alberto lo revise (con su 🔁
      // español) y lo apruebe con ✅, o siga ajustando. Solo el botón ✅ Enviar manda al huésped.
      await reproponerBorrador(pend, texto)
      return NextResponse.json({ ok: true, redrafted: true })
    }
    if (pend && pend.esperando_edit) {
      const textoEs = (msg.text || '').trim()

      // Si Alberto responde con una APROBACIÓN corta (ok / vale / sí / dale / 👍…) en vez de un texto
      // de corrección, su intención es ENVIAR EL BORRADOR TAL CUAL (no mandarle "Ok" al huésped). Lo
      // tratamos como aprobación: se envía el borrador existente (ya en el idioma del huésped).
      const esAprobacion = /^(ok(ay)?|vale|s[ií]|dale|adelante|perfecto|correcto|env[ií]a(lo)?|enviar|de acuerdo|👍|👌|✅)\.?$/i.test(textoEs)
      if (esAprobacion) {
        const ok = await enviarAlHuesped(bookingId!, pend.borrador || '')
        if (!ok) {
          await tgSend('❌ No se pudo enviar al huésped. Inténtalo de nuevo (o pulsa ✅ Enviar en el mensaje original).')
          return NextResponse.json({ ok: false, sent: false })
        }
        await prisma.$executeRaw(Prisma.sql`
          UPDATE mensajes_log SET auto_sent = true
          WHERE booking_id = ${bookingId} AND created_at = (SELECT max(created_at) FROM mensajes_log WHERE booking_id = ${bookingId})
        `).catch(() => {})
        if (pend.categoria) await evaluarGraduacion(pend.categoria)
        // Aprobación corta ("ok"/"vale"/👍…) = se da el borrador por bueno → también es un ejemplo aprendido.
        await aprenderCorreccion({ propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: pend.pregunta || '', respuestaFinal: pend.borrador || '' })
        await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId}`).catch(() => {})
        await tgSend(`✅ Enviado al huésped:\n${escapeHtml(pend.borrador || '')}`)
        return NextResponse.json({ ok: true, approved: true })
      }

      // Alberto SIEMPRE escribe en español; si el huésped es de otro idioma, traducimos su corrección
      // a ESE idioma antes de enviar (lo pidió él). El huésped recibe en su idioma; a Alberto le
      // confirmamos en español lo que se mandó.
      const lang = pend.idioma || 'es'
      let textoEnviar = textoEs
      if (lang !== 'es' && textoEs) {
        try {
          const nombre = NOMBRE_IDIOMA[lang] || lang
          const tr = (await aiComplete([{ role: 'user', content: textoEs }], { system: `Traduce este mensaje de un anfitrión para su huésped al ${nombre}. Devuelve SOLO la traducción, sin comillas ni notas.`, maxTokens: 500 })).trim()
          if (tr) textoEnviar = tr
        } catch {}
      }
      // No se envía aún: se re-propone el texto FINAL (ya traducido al idioma del huésped, con su 🔁
      // español = lo que escribió Alberto) para que lo revise y apruebe con ✅, o siga ajustando.
      await reproponerBorrador(pend, textoEnviar, { borradorEs: lang !== 'es' ? textoEs : '' })
      return NextResponse.json({ ok: true, redrafted: true })
    }
  }
  return NextResponse.json({ ok: true })
}
