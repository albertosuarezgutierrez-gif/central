// Orquestador del agente de pago de facturas a proveedores.
// Flujo: Gmail → OCR → Telegram con botones → Enable Banking PIS o SEPA XML fallback.
// Requiere: GMAIL_USER, GMAIL_APP_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
// PIS activo cuando EB_PIS_ENABLED=true + ENABLEBANKING_APP_ID + ENABLEBANKING_PRIVATE_KEY.

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { listarCandidatos, marcarProcesado } from './gmail'
import { aiExtractInvoice } from '@/lib/ai-client'
import { tgSendButtons, tgEditMessage } from '@central/core-telegram'
import { iniciarPago, estadoPago, disponiblePis } from '@/lib/enablebanking'
import type { EstadoPagoEB } from '@/lib/enablebanking'
import type { FacturaProveedor } from '@central/module-pagos'

const ETIQUETA_GMAIL = 'Facturas/Proveedor'

// ── Escaneo de Gmail → OCR → BD → Telegram ───────────────────────────────────

export async function escanearNuevasFacturas(cuentaId: string): Promise<number> {
  let nuevas = 0
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000) // últimos 7 días
  let correos: Awaited<ReturnType<typeof listarCandidatos>> = []
  try {
    correos = await listarCandidatos({ desde, etiqueta: ETIQUETA_GMAIL })
  } catch {
    return 0
  }

  for (const correo of correos) {
    if (correo.sinAdjunto) continue

    const adjunto = correo.adjuntos[0]
    if (!adjunto) continue

    // Comprobar si ya está procesado por uid de Gmail (dedupe por uid)
    const yaExiste = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM facturas_proveedor WHERE gmail_uid = ${correo.uid} AND cuenta_id = ${cuentaId}::uuid LIMIT 1`
    )
    if (yaExiste.length > 0) continue

    let datos: Record<string, any> = {}
    try {
      if (adjunto.mime === 'application/pdf') {
        const pdfParse: any = await import('pdf-parse/lib/pdf-parse.js')
        const parsed = await (pdfParse.default ?? pdfParse)(adjunto.buffer)
        datos = await aiExtractInvoice({ text: parsed.text })
      } else if (adjunto.mime.startsWith('image/')) {
        const b64 = adjunto.buffer.toString('base64')
        datos = await aiExtractInvoice({ imageBase64: b64, mimeType: adjunto.mime })
      }
    } catch {
      datos = {}
    }

    const proveedor = (datos.proveedor as string | null) || correo.from.split('<')[0].trim() || 'Proveedor desconocido'
    const importe = typeof datos.total === 'number' ? datos.total : null
    if (!importe || importe <= 0) continue

    const ivaPct = typeof datos.iva_porcentaje === 'number' ? datos.iva_porcentaje : 21
    const base = importe / (1 + ivaPct / 100)
    const cuotaIva = Math.round((base * ivaPct / 100) * 100) / 100

    const numeroFactura = (datos.numero_factura as string | null) || null
    const concepto = (datos.concepto as string | null) || correo.subject || null
    const fechaFactura = (datos.fecha as string | null) || correo.fecha
    const fechaVenc = (datos.fecha_vencimiento as string | null) || null
    const ibanProv = (datos.iban as string | null) || null

    // Dedupe por número de factura (la constraint del índice único lo garantiza).
    // Si hay conflicto, skip silencioso.
    let facturaId: string | null = null
    try {
      const res = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO facturas_proveedor
          (cuenta_id, proveedor, concepto, importe, fecha_factura, fecha_vencimiento,
           numero_factura, iban_proveedor, estado, gmail_uid, iva_porcentaje, cuota_iva, origen)
        VALUES
          (${cuentaId}::uuid, ${proveedor}, ${concepto}, ${importe}::numeric,
           ${fechaFactura}::date, ${fechaVenc ? fechaVenc : null}::date,
           ${numeroFactura}, ${ibanProv}, 'nueva', ${correo.uid}, ${ivaPct}::numeric,
           ${cuotaIva}::numeric, 'gmail')
        ON CONFLICT (cuenta_id, proveedor, numero_factura)
          WHERE numero_factura IS NOT NULL
          DO NOTHING
        RETURNING id
      `)
      facturaId = res[0]?.id ?? null
    } catch {
      continue
    }

    if (!facturaId) continue
    nuevas++

    await marcarProcesado(correo.uid, ETIQUETA_GMAIL).catch(() => {})

    // Notificar por Telegram con botones de acción
    await notificarFactura(facturaId, proveedor, importe, fechaVenc)
  }

  return nuevas
}

async function notificarFactura(
  facturaId: string,
  proveedor: string,
  importe: number,
  fechaVenc: string | null,
): Promise<void> {
  const vence = fechaVenc ? ` · vence ${fechaVenc}` : ''
  const texto = `🧾 <b>${proveedor}</b> · €${importe.toFixed(2)}${vence}`
  const botones = [
    [
      { texto: '✅ Pagar', callback: `pago_aprobar:${facturaId}` },
      { texto: '⏳ Aplazar', callback: `pago_aplazar:${facturaId}` },
    ],
    [
      { texto: '❌ Rechazar', callback: `pago_rechazar:${facturaId}` },
    ],
  ]
  try {
    const msgId = await tgSendButtons(texto, botones)
    if (msgId) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE facturas_proveedor SET telegram_msg_id = ${msgId}, estado = 'pendiente_revision'
        WHERE id = ${facturaId}::uuid
      `)
    }
  } catch { /* Telegram no crítico */ }
}

// ── Aprobar pago ──────────────────────────────────────────────────────────────

export async function aprobarPago(
  facturaId: string,
  cuentaId: string,
  debtorIban: string,
): Promise<{ ok: boolean; auth_url?: string; xml?: string; error?: string }> {
  const rows = await prisma.$queryRaw<FacturaProveedor[]>(
    Prisma.sql`SELECT * FROM facturas_proveedor WHERE id = ${facturaId}::uuid AND cuenta_id = ${cuentaId}::uuid LIMIT 1`
  )
  const factura = rows[0]
  if (!factura) return { ok: false, error: 'Factura no encontrada' }
  if (!['nueva', 'pendiente_revision', 'aprobada'].includes(factura.estado)) {
    return { ok: false, error: `Estado actual: ${factura.estado}` }
  }

  await prisma.$executeRaw(Prisma.sql`UPDATE facturas_proveedor SET estado = 'aprobada' WHERE id = ${facturaId}::uuid`)

  if (disponiblePis() && factura.iban_proveedor) {
    const redirectUrl = `${process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/banca/pago/callback?facturaId=${facturaId}`
    try {
      const pago = await iniciarPago({
        debtorIban,
        creditorName: factura.proveedor,
        creditorIban: factura.iban_proveedor,
        importe: factura.importe,
        concepto: factura.concepto ?? factura.proveedor,
        redirectUrl,
      })
      await prisma.$executeRaw(Prisma.sql`
        UPDATE facturas_proveedor
        SET estado = 'pago_iniciado', pago_id = ${pago.payment_id}, pago_url = ${pago.auth_url}
        WHERE id = ${facturaId}::uuid
      `)
      await actualizarMensajeTg(factura.telegram_msg_id, `✅ Pago iniciado — autoriza en tu banco:\n${pago.auth_url}`)
      return { ok: true, auth_url: pago.auth_url }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  // Fallback: SEPA XML (sin PIS o sin IBAN del proveedor)
  const { generarSepaXml } = await import('@central/module-pagos')
  const fechaHoy = new Date().toISOString().slice(0, 10)
  const xml = generarSepaXml({
    debtorName: 'Alberto Suárez Gutiérrez',
    debtorIban,
    fechaEjecucion: fechaHoy,
    transferencias: [{
      creditorName: factura.proveedor,
      creditorIban: factura.iban_proveedor ?? '',
      importe: factura.importe,
      concepto: factura.concepto ?? factura.proveedor,
      endToEndId: facturaId.slice(0, 35),
    }],
  })
  await prisma.$executeRaw(Prisma.sql`UPDATE facturas_proveedor SET estado = 'aprobada' WHERE id = ${facturaId}::uuid`)
  await actualizarMensajeTg(factura.telegram_msg_id, `📄 SEPA XML generado para importar manualmente en el banco.`)
  return { ok: true, xml }
}

// ── Aplazar pago ──────────────────────────────────────────────────────────────

export async function aplazarPago(facturaId: string, cuentaId: string, dias = 7): Promise<boolean> {
  const hasta = new Date(Date.now() + dias * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const res = await prisma.$executeRaw(Prisma.sql`
    UPDATE facturas_proveedor
    SET estado = 'aplazada', aplazar_hasta = ${hasta}::date
    WHERE id = ${facturaId}::uuid AND cuenta_id = ${cuentaId}::uuid
  `)
  const rows = await prisma.$queryRaw<{ telegram_msg_id: number | null }[]>(
    Prisma.sql`SELECT telegram_msg_id FROM facturas_proveedor WHERE id = ${facturaId}::uuid LIMIT 1`
  )
  await actualizarMensajeTg(rows[0]?.telegram_msg_id ?? null, `⏳ Aplazado hasta el ${hasta}`)
  return (res as any) > 0
}

// ── Rechazar factura ──────────────────────────────────────────────────────────

export async function rechazarFactura(facturaId: string, cuentaId: string): Promise<boolean> {
  const res = await prisma.$executeRaw(Prisma.sql`
    UPDATE facturas_proveedor SET estado = 'rechazada'
    WHERE id = ${facturaId}::uuid AND cuenta_id = ${cuentaId}::uuid
  `)
  const rows = await prisma.$queryRaw<{ telegram_msg_id: number | null }[]>(
    Prisma.sql`SELECT telegram_msg_id FROM facturas_proveedor WHERE id = ${facturaId}::uuid LIMIT 1`
  )
  await actualizarMensajeTg(rows[0]?.telegram_msg_id ?? null, `❌ Factura rechazada`)
  return (res as any) > 0
}

// ── Verificar pagos en curso (pago_iniciado → ACSC → pagada) ─────────────────

export async function verificarPagosPendientes(): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: string; pago_id: string; telegram_msg_id: number | null }[]>(
    Prisma.sql`SELECT id, pago_id, telegram_msg_id FROM facturas_proveedor WHERE estado = 'pago_iniciado' AND pago_id IS NOT NULL`
  )
  let confirmados = 0
  for (const row of rows) {
    try {
      const est: EstadoPagoEB = await estadoPago(row.pago_id)
      if (est === 'ACSC') {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE facturas_proveedor
          SET estado = 'pagada', pago_confirmado_at = NOW()
          WHERE id = ${row.id}::uuid
        `)
        await actualizarMensajeTg(row.telegram_msg_id, `✅ Pago confirmado por el banco.`)
        confirmados++
      } else if (est === 'RJCT') {
        await prisma.$executeRaw(Prisma.sql`UPDATE facturas_proveedor SET estado = 'aprobada' WHERE id = ${row.id}::uuid`)
        await actualizarMensajeTg(row.telegram_msg_id, `⚠️ Pago rechazado por el banco — vuelve a autorizar.`)
      }
    } catch { /* continuar con la siguiente */ }
  }
  return confirmados
}

// ── Auto-conciliación con movimientos bancarios ───────────────────────────────
// Cruza facturas_proveedor (aprobadas/pago_iniciado) con v_movimientos_activos
// por proveedor + importe + fecha ±3 días. Si encuentra coincidencia, marca pagada.

export async function conciliarConBanco(cuentaId: string): Promise<number> {
  const conciliadas = await prisma.$queryRaw<{ id: string; telegram_msg_id: number | null }[]>(Prisma.sql`
    WITH coincidencias AS (
      SELECT
        fp.id AS factura_id,
        fp.telegram_msg_id,
        mb.id AS movimiento_id
      FROM facturas_proveedor fp
      JOIN v_movimientos_activos mb
        ON ABS(mb.importe) BETWEEN fp.importe * 0.97 AND fp.importe * 1.03
        AND mb.importe < 0
        AND (
          mb.concepto_normalizado ILIKE '%' || fp.proveedor || '%'
          OR mb.concepto          ILIKE '%' || fp.proveedor || '%'
          OR mb.contraparte       ILIKE '%' || fp.proveedor || '%'
        )
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE fp.cuenta_id = ${cuentaId}::uuid
        AND fp.estado IN ('aprobada', 'pago_iniciado')
        AND cb.cuenta_id = ${cuentaId}::uuid
        AND mb.fecha_operacion BETWEEN
          COALESCE(fp.fecha_vencimiento, fp.fecha_factura, NOW()::date) - INTERVAL '3 days'
          AND COALESCE(fp.fecha_vencimiento, fp.fecha_factura, NOW()::date) + INTERVAL '7 days'
    )
    UPDATE facturas_proveedor fp
    SET estado = 'pagada', pago_confirmado_at = NOW()
    FROM coincidencias c
    WHERE fp.id = c.factura_id
    RETURNING fp.id, fp.telegram_msg_id
  `)

  for (const row of conciliadas) {
    await actualizarMensajeTg(row.telegram_msg_id, `✅ Pago conciliado con el extracto bancario.`)
  }
  return conciliadas.length
}

// ── Helpers internos ──────────────────────────────────────────────────────────

async function actualizarMensajeTg(msgId: number | null, texto: string): Promise<void> {
  if (!msgId) return
  try {
    await tgEditMessage(msgId, texto)
  } catch { /* Telegram no crítico */ }
}
