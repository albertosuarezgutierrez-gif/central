import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { parseCallback, tgAnswerCallback, tgAskForReply, tgSend, tgSendButtons, tgEditMessage, escapeHtml, verifyTelegramWebhook } from '@central/core-telegram'
import { enviarAlHuesped } from '@/lib/sivra/agente-huesped/enviar'
import { confirmarEnviado, confirmarDescartado, reproponerBorrador } from '@/lib/sivra/agente-huesped/telegram-msg'
import { aprenderCorreccion } from '@/lib/sivra/agente-huesped/aprender'
import { evaluarGraduacion, graduarCategoria } from '@/lib/sivra/agente-huesped/graduacion'
import { aplicarRetoque } from '@/lib/sivra/agente-huesped/retoque'
import { redactarDesdeIdea } from '@/lib/sivra/agente-huesped/redactar'
import type { ContextoRedaccion } from '@/lib/sivra/agente-huesped/redactar'
import { aprobarPago, aplazarPago, rechazarFactura, pagarTodo, resumenSemanal } from '@/lib/agente-facturas/pagos'
import { getMovParaCallback, aprenderReglaMovimiento, enviarMensajeDudoso, sugerirDestinoConContexto, PROP_LABELS } from '@/lib/agente-movimientos'
import { getCuentaTelegram, resolverAccionTg, manejarTextoLibreTg, manejarDocumentoTg, manejarVozTg, descargarTelegram, adjuntoDeMensaje, vozDeMensaje, arrancarOnboarding, esComandoContable } from '@/lib/contable/telegram'

export const dynamic = 'force-dynamic'
// El reenvío a ia-rest puede tardar (publicar un Reel espera a que Instagram
// procese el vídeo, hasta ~120s). Sin esto, Vercel corta a 60s y el botón muere.
export const maxDuration = 300

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

  // ── Agente Instagram/blog de ia-rest (bot compartido) ────────────────────
  // El webhook del bot apunta AQUÍ, pero los callbacks ig_*/blog_*/briefing_*
  // y los mensajes "/ig ..." los maneja ia-rest → reenviar tal cual (con el
  // mismo secret de Telegram) y devolver su resultado. Si no se reenvía, el
  // botón se queda en "conectando…" para siempre.
  const cbData: string = body.callback_query?.data || ''
  const msgTexto: string = body.message?.text || ''
  const esInstagram =
    /^(ig_|blog_|briefing_)/.test(cbData) ||
    msgTexto.startsWith('/ig ') || /^instagram:/i.test(msgTexto)
  // Callbacks del CRM de ventas de ia-rest (emails fríos, propuestas, WhatsApp, QA):
  // también viven en ia-rest. Sin este reenvío, el botón "✅ Enviar email" de las
  // propuestas de venta muere aquí en silencio (bug detectado 03/07/2026).
  const esCrmIarest =
    /^(propuesta_ok|propuesta_no|propuesta_foco|enviar_email|revisar_email|enviar_sevilla|descartar_sevilla|ver_whatsapp|qa_activar|qa_descartar)(:|$)/.test(cbData)
  if (esInstagram || esCrmIarest) {
    await fetch('https://www.iarest.es/api/telegram/instagram-callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': req.headers.get('x-telegram-bot-api-secret-token') ?? '',
        // El TELEGRAM_WEBHOOK_SECRET de ia-rest tiene otro valor (env por
        // proyecto) → autenticamos con el secreto que SÍ comparten ambos
        // proyectos (puerto god-panel ↔ ia-rest).
        'x-operador-secret': process.env.OPERADOR_SHARED_SECRET ?? '',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(280_000),
    }).catch((e) => console.error('[tg] reenvío Instagram ia-rest:', e))
    return NextResponse.json({ ok: true })
  }

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

    // ── Deducciones de cuota IRPF (mecenazgo / guardería / deportiva) ────────
    if (prefix === 'deduccion') {
      const movId = args[0]
      if (!movId) { await tgAnswerCallback(cb.id, 'No encontrado'); return NextResponse.json({ ok: true }) }

      const tiposValidos = ['mecenazgo', 'guarderia', 'deportiva_and'] as const
      type DeduccionTipo = typeof tiposValidos[number]
      const tipo: DeduccionTipo | null = (action !== 'ninguna' && tiposValidos.includes(action as DeduccionTipo))
        ? (action as DeduccionTipo) : null

      const movRows = await prisma.$queryRaw<{ cuenta_id: string; concepto: string | null; fecha_operacion: Date | null }[]>`
        SELECT cb.cuenta_id, mb.concepto, mb.fecha_operacion
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE mb.id = ${movId}::uuid
        LIMIT 1
      `
      const movRow = movRows[0]
      if (!movRow) { await tgAnswerCallback(cb.id, 'No encontrado'); return NextResponse.json({ ok: true }) }
      const cuentaId = movRow.cuenta_id
      const year = movRow.fecha_operacion ? movRow.fecha_operacion.getFullYear() : new Date().getFullYear()

      await prisma.$executeRaw`
        UPDATE movimientos_bancarios SET deduccion_cuota_tipo = ${tipo}
        WHERE id = ${movId}::uuid
      `

      if (movRow.concepto) {
        const { claveReferencia, claveComercio } = await import('@/lib/correduria')
        const clave = claveReferencia(movRow.concepto) ?? claveComercio(movRow.concepto)
        if (clave) {
          await prisma.$executeRaw`
            INSERT INTO banca_destino_reglas (cuenta_id, clave, destino, deduccion_cuota_tipo)
            VALUES (${cuentaId}::uuid, ${clave}, 'personal', ${tipo})
            ON CONFLICT (cuenta_id, clave) DO UPDATE SET deduccion_cuota_tipo = EXCLUDED.deduccion_cuota_tipo
          `
          await prisma.$executeRaw`
            UPDATE movimientos_bancarios mb
            SET deduccion_cuota_tipo = ${tipo}
            FROM cuentas_bancarias cb
            WHERE cb.id = mb.cuenta_bancaria_id
              AND cb.cuenta_id = ${cuentaId}::uuid
              AND mb.concepto ILIKE ${'%' + clave + '%'}
              AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
              AND mb.id <> ${movId}::uuid
          `
        }
      }

      // Sincronizar fiscal_perfil con los nuevos totales
      const totalesRows = await prisma.$queryRaw<{ tipo: string; total: unknown }[]>`
        SELECT mb.deduccion_cuota_tipo AS tipo, SUM(ABS(mb.importe)) AS total
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE cb.cuenta_id = ${cuentaId}::uuid
          AND mb.deduccion_cuota_tipo IS NOT NULL
          AND mb.importe < 0
          AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
          AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
        GROUP BY mb.deduccion_cuota_tipo
      `
      const t: Record<string, number> = {}
      for (const r of totalesRows) t[r.tipo] = Number(r.total)
      await prisma.$executeRaw`
        INSERT INTO fiscal_perfil (cuenta_id, donativos_anual, gasto_guarderia_anual, gasto_deportivo_anual)
        VALUES (${cuentaId}::uuid, ${t.mecenazgo ?? 0}, ${t.guarderia ?? 0}, ${t.deportiva_and ?? 0})
        ON CONFLICT (cuenta_id) DO UPDATE SET
          donativos_anual       = EXCLUDED.donativos_anual,
          gasto_guarderia_anual = EXCLUDED.gasto_guarderia_anual,
          gasto_deportivo_anual = EXCLUDED.gasto_deportivo_anual
      `

      const tipoLabel: Record<string, string> = {
        mecenazgo: '🏛️ Mecenazgo', guarderia: '👶 Guardería', deportiva_and: '⚽ Deportiva And.',
      }
      await tgAnswerCallback(cb.id, tipo ? `✅ ${tipoLabel[tipo]}` : '✅ Quitada')
      await tgSend(tipo
        ? `✅ Marcado como <b>${tipoLabel[tipo]}</b> — deducción de cuota IRPF registrada.`
        : '✅ Deducción de cuota quitada.').catch(() => {})
      return NextResponse.json({ ok: true })
    }

    // ── Radar de subastas: seguir / descartar desde el aviso ────────────────
    // El descarte alimenta el aprendizaje futuro: queda en subastas_radar como
    // decisión explícita de Alberto, no como silencio.
    if (prefix === 'subr') {
      const radarId = args[0]
      if (!radarId) { await tgAnswerCallback(cb.id, 'No encontrado'); return NextResponse.json({ ok: true }) }
      const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id, cuenta_id, dedupe_key, subasta, fecha_fin FROM subastas_radar WHERE id = ${radarId}::uuid
      `)
      const fila = filas[0]
      if (!fila) { await tgAnswerCallback(cb.id, 'Subasta no encontrada'); return NextResponse.json({ ok: true }) }

      if (action === 'seguir') {
        // Idempotente: si ya la sigue, no se duplica.
        const ya = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT 1 FROM subastas_seguidas WHERE cuenta_id = ${fila.cuenta_id}::uuid AND dedupe_key = ${fila.dedupe_key} LIMIT 1
        `)
        if (!ya.length) {
          await prisma.$executeRaw(Prisma.sql`
            INSERT INTO subastas_seguidas (cuenta_id, dedupe_key, subasta, fecha_fin)
            VALUES (${fila.cuenta_id}::uuid, ${fila.dedupe_key}, ${JSON.stringify(fila.subasta)}::jsonb, ${fila.fecha_fin})
          `)
        }
        await prisma.$executeRaw(Prisma.sql`UPDATE subastas_radar SET visto = true WHERE id = ${radarId}::uuid`)
        await tgAnswerCallback(cb.id, '👀 Siguiéndola — entra en el aviso de cierre y en la tesorería')
        return NextResponse.json({ ok: true })
      }
      if (action === 'desc') {
        await prisma.$executeRaw(Prisma.sql`UPDATE subastas_radar SET descartado = true WHERE id = ${radarId}::uuid`)
        await tgAnswerCallback(cb.id, '🚫 Descartada')
        return NextResponse.json({ ok: true })
      }
      await tgAnswerCallback(cb.id, 'Acción desconocida')
      return NextResponse.json({ ok: true })
    }

    // ── Agente revisión movimientos bancarios ────────────────────────────────
    if (prefix === 'mov') {
      const movId = args[0]
      if (!movId) { await tgAnswerCallback(cb.id, 'No encontrado'); return NextResponse.json({ ok: true }) }

      if (action === 'saltar') {
        await tgAnswerCallback(cb.id, '⏭️ Saltado')
        return NextResponse.json({ ok: true })
      }

      if (action === 'cambiar') {
        // El usuario rechaza la sugerencia IA → mostrar las 3 opciones
        await tgAnswerCallback(cb.id, 'Elige destino')
        const concepto = (await getMovParaCallback(movId))?.concepto ?? ''
        const label = concepto.replace(/^COMPRA EN\s+/i, '').slice(0, 40).toUpperCase()
        await tgSendButtons(
          `❓ <b>${label}</b>\n\n¿Cuál es el destino correcto?`,
          [[
            { texto: '✅ Pisos — deducible',      callback: `mov_pisos:${movId}` },
            { texto: '✅ Correduría — deducible',  callback: `mov_correduria:${movId}` },
          ], [
            { texto: '❌ Personal — no deducible', callback: `mov_personal:${movId}` },
            { texto: '⏭️ Saltar',                  callback: `mov_saltar:${movId}` },
          ]],
        ).catch(() => {})
        return NextResponse.json({ ok: true })
      }

      // Resolver datos del movimiento
      const movData = await getMovParaCallback(movId)
      if (!movData) { await tgAnswerCallback(cb.id, 'Movimiento no encontrado'); return NextResponse.json({ ok: true }) }
      const { cuentaId, concepto } = movData

      if (action === 'confirmar_ia') {
        // Confirmación de sugerencia IA: args[1] = destino sugerido
        const destino = args[1] ?? 'personal'
        if (destino === 'turistico_pisos') {
          // Preguntar a qué piso antes de confirmar
          await tgAnswerCallback(cb.id, '¿Para qué piso?')
          const propOpts = Object.entries(PROP_LABELS).map(([id, nombre]) => ({
            texto: nombre, callback: `mov_prop:${movId}:${id}`,
          }))
          await tgSendButtons('📍 ¿Para qué piso?', [propOpts.slice(0, 2), [...propOpts.slice(2), { texto: 'Todos', callback: `mov_prop:${movId}:todos` }]]).catch(() => {})
          return NextResponse.json({ ok: true })
        }
        await prisma.$executeRaw(Prisma.sql`
          UPDATE movimientos_bancarios
          SET destino = ${destino}, destino_confirmado = true, requiere_revision = false
          WHERE id = ${movId}::uuid
        `)
        if (concepto) await aprenderReglaMovimiento(cuentaId, concepto, destino)
        await tgAnswerCallback(cb.id, '✅ Confirmado')
        await tgSend(`✅ Clasificado como <b>${destino === 'seguros' ? 'Correduría' : 'Personal'}</b>. Regla guardada.`).catch(() => {})
        return NextResponse.json({ ok: true })
      }

      if (action === 'pisos') {
        await tgAnswerCallback(cb.id, '¿Para qué piso?')
        const propOpts = Object.entries(PROP_LABELS).map(([id, nombre]) => ({
          texto: nombre, callback: `mov_prop:${movId}:${id}`,
        }))
        await tgSendButtons('📍 ¿Para qué piso?', [propOpts.slice(0, 2), [...propOpts.slice(2), { texto: 'Todos', callback: `mov_prop:${movId}:todos` }]]).catch(() => {})
        return NextResponse.json({ ok: true })
      }

      if (action === 'prop') {
        // args[1] = propId o 'todos'
        const propId = args[1] ?? 'todos'
        const propNombre = propId === 'todos' ? 'todos los pisos' : (PROP_LABELS[propId] ?? propId)
        await prisma.$executeRaw(Prisma.sql`
          UPDATE movimientos_bancarios
          SET destino = 'turistico_pisos',
              propiedad_id = ${propId === 'todos' ? null : propId},
              destino_confirmado = true,
              requiere_revision = false
          WHERE id = ${movId}::uuid
        `)
        if (concepto) await aprenderReglaMovimiento(cuentaId, concepto, 'turistico_pisos')
        await tgAnswerCallback(cb.id, '✅ Guardado')
        await tgSend(`✅ <b>Pisos · ${propNombre}</b> — deducible. Regla guardada.`).catch(() => {})
        return NextResponse.json({ ok: true })
      }

      if (action === 'correduria') {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE movimientos_bancarios
          SET destino = 'seguros', destino_confirmado = true, requiere_revision = false
          WHERE id = ${movId}::uuid
        `)
        if (concepto) await aprenderReglaMovimiento(cuentaId, concepto, 'seguros')
        await tgAnswerCallback(cb.id, '✅ Guardado')
        await tgSend('✅ <b>Correduría</b> — deducible. Regla guardada.').catch(() => {})
        return NextResponse.json({ ok: true })
      }

      if (action === 'personal') {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE movimientos_bancarios
          SET destino = 'personal', destino_confirmado = true, requiere_revision = false
          WHERE id = ${movId}::uuid
        `)
        if (concepto) await aprenderReglaMovimiento(cuentaId, concepto, 'personal')
        await tgAnswerCallback(cb.id, '✅ Guardado')
        await tgSend('✅ <b>Personal</b> — no deducible. Regla guardada.').catch(() => {})
        return NextResponse.json({ ok: true })
      }

      return NextResponse.json({ ok: true })
    }

    // ── Agente de contabilidad: confirmar/descartar una acción propuesta (cont_ok/cont_no) ──
    if (prefix === 'cont') {
      const cuentaId = await getCuentaTelegram()
      if (!cuentaId) { await tgAnswerCallback(cb.id, 'Sin cuenta'); return NextResponse.json({ ok: true }) }
      const toast = await resolverAccionTg(cuentaId, action === 'no' ? 'no' : 'ok', args[0] || '')
      await tgAnswerCallback(cb.id, toast)
      await tgSend(action === 'no' ? '✖️ Descartada.' : `✅ ${escapeHtml(toast)}`).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    if (prefix !== 'hsp') return NextResponse.json({ ok: true }) // no es de este agente (bot compartido)
    const bookingId = args[0]
    const pend = bookingId ? await getPendiente(bookingId) : null
    if (!pend) {
      // El borrador ya no está pendiente: se envió/descartó desde otro aviso, o es un botón de una
      // propuesta DUPLICADA ya resuelta (mismo mensaje del huésped propuesto dos veces). En vez del
      // críptico "Ya no está disponible", avisamos claro y RETIRAMOS los botones del mensaje pulsado
      // (editar el texto sin reply_markup quita el teclado) para que no vuelva a inducir a error.
      const eraEnvio = action === 'send' || action === 'grant' || action === 'grad'
      await tgAnswerCallback(cb.id, eraEnvio ? 'Ese borrador ya se envió o se gestionó' : 'Ya no está disponible')
      const staleId = cb.message?.message_id
      if (staleId) await tgEditMessage(staleId, '☑️ <i>Este borrador ya se gestionó (enviado o descartado en otro aviso).</i>').catch(() => {})
      return NextResponse.json({ ok: true })
    }

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

  // C) Catch-all del agente de CONTABILIDAD: mensaje suelto de Alberto que NO consumió ningún flujo
  //    anterior (ni callback, ni reply de force_reply). Va AL FINAL a propósito, para no secuestrar
  //    los flujos pago_/mov_/hsp_/deduccion_ ni las respuestas force_reply del agente de huéspedes.
  //    Solo el chat de Alberto (TELEGRAM_CHAT_ID); un mensaje que es reply se deja pasar (no es para él).
  if (msg && !msg.reply_to_message && String(msg.chat?.id || '') === String(process.env.TELEGRAM_CHAT_ID || '')) {
    const cuentaId = await getCuentaTelegram()
    if (cuentaId) {
      const voz = vozDeMensaje(msg)
      if (voz) {
        const file = await descargarTelegram(voz.fileId, voz.mimeHint, voz.nameHint)
        if (file) await manejarVozTg(cuentaId, file.buffer, file.mimeType, file.fileName)
        else await tgSend('No pude descargar la nota de voz. Reinténtala.').catch(() => {})
        return NextResponse.json({ ok: true })
      }
      const adj = adjuntoDeMensaje(msg)
      if (adj) {
        const file = await descargarTelegram(adj.fileId, adj.mimeHint, adj.nameHint)
        if (file) await manejarDocumentoTg(cuentaId, file.buffer, file.mimeType, file.fileName)
        else await tgSend('No pude descargar el archivo de Telegram. Reinténtalo.').catch(() => {})
        return NextResponse.json({ ok: true })
      }
      const texto = (msg.text || '').trim()
      if (texto && esComandoContable(texto)) { await arrancarOnboarding(); return NextResponse.json({ ok: true }) }
      if (texto && !texto.startsWith('/')) { await manejarTextoLibreTg(cuentaId, texto); return NextResponse.json({ ok: true }) }
    }
  }
  return NextResponse.json({ ok: true })
}
