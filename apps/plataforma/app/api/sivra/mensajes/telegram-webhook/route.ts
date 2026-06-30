import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { parseCallback, tgAnswerCallback, tgAskForReply, tgSend, escapeHtml, verifyTelegramWebhook } from '@central/core-telegram'
import { enviarAlHuesped } from '@/lib/sivra/agente-huesped/enviar'
import { confirmarEnviado, confirmarDescartado, reproponerBorrador } from '@/lib/sivra/agente-huesped/telegram-msg'
import { aprenderCorreccion } from '@/lib/sivra/agente-huesped/aprender'
import { evaluarGraduacion, graduarCategoria } from '@/lib/sivra/agente-huesped/graduacion'
import { aplicarRetoque } from '@/lib/sivra/agente-huesped/retoque'
import { redactarDesdeIdea } from '@/lib/sivra/agente-huesped/redactar'
import type { ContextoRedaccion } from '@/lib/sivra/agente-huesped/redactar'
import { aprobarPago, aplazarPago, rechazarFactura, pagarTodo, resumenSemanal } from '@/lib/agente-facturas/pagos'

export const dynamic = 'force-dynamic'

const PROP_NOMBRES: Record<string, string> = {
  prop_house_sevillana: 'House Sevillana',
  prop_busto_reform: 'Busto Reform',
  prop_luxury_busto: 'Luxury Busto',
  prop_duplex_center: 'Dúplex Center',
}

async function cargarCtxRedaccion(bookingId: string, pend: Pendiente): Promise<ContextoRedaccion> {
  const [income, logs] = await Promise.all([
    prisma.$queryRaw<{ guestName: string; checkIn: string; checkOut: string }[]>(
      Prisma.sql`SELECT "guestName", "checkIn", "checkOut" FROM incomes WHERE "reservationId" = ${bookingId} LIMIT 1`,
    ).then(r => r[0] ?? null).catch(() => null),
    prisma.$queryRaw<{ pregunta: string; respuesta: string }[]>(
      Prisma.sql`SELECT pregunta, respuesta FROM mensajes_log WHERE booking_id = ${bookingId} AND respuesta <> '' ORDER BY created_at DESC LIMIT 3`,
    ).catch(() => [] as { pregunta: string; respuesta: string }[]),
  ])
  const historial = [...logs].reverse().map(l => `Huésped: ${l.pregunta}\nAnfitrión: ${l.respuesta}`).join('\n')
  return {
    pregunta: pend.pregunta || '',
    historial,
    idioma: pend.idioma || 'es',
    propiedad: PROP_NOMBRES[pend.property_id || ''] || 'el apartamento',
    guestName: income?.guestName || 'el huésped',
    checkIn: income?.checkIn || '',
    checkOut: income?.checkOut || '',
  }
}

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
    // ── Agente de pagos a proveedores ────────────────────────────────────────
    if (prefix === 'pago') {
      // Acciones con args[0] = cuentaId (no facturaId)
      if (action === 'pagartodo') {
        const cuentaId = args[0]
        if (!cuentaId) { await tgAnswerCallback(cb.id, 'Error'); return NextResponse.json({ ok: true }) }
        await tgAnswerCallback(cb.id, '⏳ Procesando pagos…')
        const result = await pagarTodo(cuentaId)
        await tgSend(`✅ ${result.ok} pago(s) iniciados${result.error ? ` · ⚠️ ${result.error} error(es)` : ''}`)
        return NextResponse.json({ ok: true })
      }

      if (action === 'revisarunauna') {
        await tgAnswerCallback(cb.id, 'Ok, revisa el chat de facturas una a una')
        return NextResponse.json({ ok: true })
      }

      // Acciones con args[0] = facturaId
      const facturaId = args[0]
      if (!facturaId) { await tgAnswerCallback(cb.id, 'Factura no encontrada'); return NextResponse.json({ ok: true }) }

      if (action === 'novinc') {
        await tgAnswerCallback(cb.id, 'Ok, no se vincula')
        return NextResponse.json({ ok: true })
      }

      if (action === 'vincular') {
        // args = [facturaId, propertyId, checkOut] — el ref viene separado por ":"
        // El callback_data fue: pago_vincular:{facturaId}:{propertyId}:{checkOut}
        // parseCallback divide por ":" → args = [facturaId, propertyId, checkOut]
        const [, propertyId, checkOut] = args
        const reservaRef = propertyId && checkOut ? `${propertyId}:${checkOut}` : propertyId ?? ''
        await prisma.$executeRaw(Prisma.sql`
          UPDATE facturas_proveedor SET reserva_id = ${reservaRef}
          WHERE id = ${facturaId}::uuid
        `)
        await tgAnswerCallback(cb.id, '✅ Factura vinculada a la reserva')
        return NextResponse.json({ ok: true })
      }

      // Resolver cuenta_id desde la factura (el bot es único, no hay sesión de navegador)
      const cuentaRows = await prisma.$queryRaw<{ cuenta_id: string }[]>(
        Prisma.sql`SELECT cuenta_id FROM facturas_proveedor WHERE id = ${facturaId}::uuid LIMIT 1`
      )
      const cuentaId = cuentaRows[0]?.cuenta_id
      if (!cuentaId) { await tgAnswerCallback(cb.id, 'Factura no encontrada'); return NextResponse.json({ ok: true }) }

      if (action === 'aprobar') {
        await tgAnswerCallback(cb.id, '⏳ Iniciando pago…')
        const debtorIban = process.env.EB_DEBTOR_IBAN ?? ''
        const result = await aprobarPago(facturaId, cuentaId, debtorIban)
        if (result.ok && result.auth_url) {
          await tgSend(`🔐 Autoriza el pago en tu banco:\n${result.auth_url}`)
        } else if (!result.ok) {
          await tgSend(`❌ Error al iniciar el pago: ${result.error}`)
        }
        return NextResponse.json({ ok: true })
      }

      if (action === 'aplazar') {
        await tgAnswerCallback(cb.id, '⏳ Aplazado 7 días')
        await aplazarPago(facturaId, cuentaId, 7)
        return NextResponse.json({ ok: true })
      }

      if (action === 'rechazar') {
        await tgAnswerCallback(cb.id, '❌ Factura rechazada')
        await rechazarFactura(facturaId, cuentaId)
        return NextResponse.json({ ok: true })
      }

      return NextResponse.json({ ok: true })
    }

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
      await tgAnswerCallback(cb.id, 'Escribe tu idea')
      await tgAskForReply(`✏️ Escribe tu idea en bruto y la IA la redactará en el idioma del huésped (reserva ${bookingId})`)
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
      const idea = (msg.text || '').trim()

      // Si Alberto responde con una APROBACIÓN corta (ok / vale / sí / dale / 👍…) en vez de una idea,
      // su intención es ENVIAR EL BORRADOR TAL CUAL (no mandarle "Ok" al huésped). Lo tratamos como
      // aprobación: se envía el borrador existente (ya en el idioma del huésped).
      const esAprobacion = /^(ok(ay)?|vale|s[ií]|dale|adelante|perfecto|correcto|env[ií]a(lo)?|enviar|de acuerdo|👍|👌|✅)\.?$/i.test(idea)
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
        await aprenderCorreccion({ propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: pend.pregunta || '', respuestaFinal: pend.borrador || '' })
        await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId}`).catch(() => {})
        await tgSend(`✅ Enviado al huésped:\n${escapeHtml(pend.borrador || '')}`)
        return NextResponse.json({ ok: true, approved: true })
      }

      // Alberto escribe su idea en bruto (en español). La IA la redacta como mensaje profesional
      // en el idioma del huésped usando el contexto completo de la reserva y el historial reciente.
      const ctx = await cargarCtxRedaccion(bookingId!, pend)
      const borrador = await redactarDesdeIdea(idea, ctx)
      if (!borrador) {
        await tgSend('❌ No pude redactar el mensaje. Prueba con 🔧 Retocar para ajustar el borrador actual, o vuelve a intentarlo con otra idea.')
        return NextResponse.json({ ok: false, redrafted: false })
      }
      // No se envía aún: se re-propone el borrador redactado para que Alberto lo revise y apruebe.
      await reproponerBorrador(pend, borrador)
      return NextResponse.json({ ok: true, redrafted: true })
    }
  }
  return NextResponse.json({ ok: true })
}
