// Orquestador del agente de pago de facturas a proveedores.
// Flujo: Gmail → OCR → Telegram con botones → Enable Banking PIS o SEPA XML fallback.
// Requiere: GMAIL_USER, GMAIL_APP_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
// PIS activo cuando EB_PIS_ENABLED=true + ENABLEBANKING_APP_ID + ENABLEBANKING_PRIVATE_KEY.

import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { Prisma } from '@prisma/client'
import { listarCandidatosConLimite, marcarProcesado, etiquetarCorreo, quitarEtiqueta, type ListadoCandidatos } from './gmail'
import { ordenarAdjuntosFactura } from './elegir-adjuntos'
import { aiExtractInvoiceDetallado, type FalloExtraccion } from '@/lib/ai-client'
import { tgAviso, tgAvisoBotones, tgEditMessage } from '@/lib/telegram'
import { iniciarPago, estadoPago, disponiblePis } from '@/lib/enablebanking'
import type { EstadoPagoEB } from '@/lib/enablebanking'
import { baseUrl } from '@/lib/base-url'
import type { FacturaProveedor } from '@central/module-pagos'

const ETIQUETA_GMAIL = 'Facturas/Proveedor'
/**
 * Cola persistente de lo que no se pudo leer. ⚠️ Límite conocido y asumido: el
 * escaneo mira una ventana de 7 días, así que un correo que falle 7 días seguidos
 * deja de reintentarse solo y se queda AQUÍ para revisión a mano — la etiqueta no
 * promete un reintento eterno.
 */
const ETIQUETA_SIN_LEER = 'Facturas/Extraccion-fallida'

/**
 * Cuántos adjuntos se prueban por correo antes de rendirse.
 *
 * No es 1 porque el primero suele ser el logo del HTML, y no es «todos» porque un
 * correo maquetado trae una docena de iconos y cada intento es una llamada a la IA:
 * con el orden de `elegir-adjuntos.ts` la factura sale en los primeros puestos.
 */
const MAX_ADJUNTOS_POR_CORREO = 3

// ── Escaneo de Gmail → OCR → BD → Telegram ───────────────────────────────────

/**
 * 🚨 `nuevas: 0` NO significa «no había facturas»: puede ser «no se pudo mirar»
 * (IMAP caído, app-password rotada, etiqueta de Gmail renombrada). Antes ambos
 * casos devolvían el mismo `0` y aguas abajo el chat afirmaba «no tienes
 * facturas de proveedor pendientes 🎉» sin que nada lo desmintiera. Por eso el
 * resultado lleva `ok`: quien llame debe registrarlo como latido y avisar.
 */
export interface ResultadoEscaneo {
  nuevas: number
  /** `false` = la pasada NO se pudo completar; `nuevas` no es una conclusión. */
  ok: boolean
  error: string | null
  /**
   * Correos que quedaron SIN mirar al agotarse el presupuesto de tiempo. Se retoman
   * en la pasada siguiente (el dedupe por `gmail_uid` hace la pasada idempotente),
   * pero si esto no baja de cero nunca, hay un atasco que contar.
   */
  pendientes: number
  /**
   * 🚨 Candidatos que NO se pudieron leer (la extracción por IA no respondió, o el PDF
   * no se dejó abrir). Antes se descartaban en silencio con un `continue`, así que
   * «0 facturas nuevas» significaba indistintamente «no había» o «había y no supe
   * leerlas». Van etiquetados en Gmail (`Facturas/Extraccion-fallida`) para reintentar.
   */
  sinLeer: number
  /** Candidatos leídos y descartados con criterio (no eran factura). Informativo. */
  descartados: number
  /**
   * De los `sinLeer`, cuántos se pudieron encolar de verdad en Gmail. Si es menor
   * que `sinLeer`, la etiqueta no existe o IMAP la rechazó: esos correos NO están
   * en ninguna cola y solo constan aquí.
   */
  encolados: number
}

/**
 * @param opts.deadline epoch ms en el que el escaneo debe estar de vuelta. Sin él
 *   el trabajo es ilimitado y la función acaba muriendo por `maxDuration` — que es
 *   justo como se perdía el latido antes del 31/07/2026.
 */
export async function escanearNuevasFacturas(
  cuentaId: string,
  opts: { deadline?: number } = {},
): Promise<ResultadoEscaneo> {
  let nuevas = 0
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000) // últimos 7 días
  const { deadline } = opts
  // El listado se lleva como mucho el 60% del presupuesto: si se lo comiera entero,
  // no quedaría tiempo para procesar ni una factura de las que acaba de encontrar.
  const deadlineListado = deadline ? Date.now() + (deadline - Date.now()) * 0.6 : undefined

  let listado: ListadoCandidatos
  try {
    listado = await listarCandidatosConLimite({ desde, etiqueta: ETIQUETA_GMAIL, deadline: deadlineListado })
  } catch (e: any) {
    // El buzón no se ha podido leer: se dice, no se disfraza de «0 facturas».
    return { nuevas: 0, ok: false, error: String(e?.message ?? e).slice(0, 200), pendientes: 0, sinLeer: 0, descartados: 0, encolados: 0 }
  }
  const correos = listado.correos

  // Se procesa igualmente lo que sí se listó (trabajo aprovechado), pero la pasada
  // NO se declara buena: no se ha llegado a ver el buzón entero.
  const ok = !listado.truncado
  const error: string | null = listado.truncado
    ? `el listado del buzón no cupo en el presupuesto de tiempo (${correos.length} correo(s) leídos de la ventana de 7 días)`
    : null
  let pendientes = 0
  let sinLeer = 0
  let descartados = 0
  let encolados = 0
  /** Message-IDs de correos que SÍ se han podido leer en esta pasada. */
  const resueltos: string[] = []

  for (let i = 0; i < correos.length; i++) {
    if (deadline && Date.now() > deadline) {
      pendientes = correos.length - i
      break
    }
    const correo = correos[i]
    if (correo.sinAdjunto) continue

    // 🚨 NO `adjuntos[0]`: en un correo maquetado el primer adjunto es el logo del
    // HTML, no la factura (ver `elegir-adjuntos.ts`, caso DIGI del 05/08/2026).
    const candidatos = ordenarAdjuntosFactura(correo.adjuntos).slice(0, MAX_ADJUNTOS_POR_CORREO)
    if (candidatos.length === 0) continue

    // Comprobar si ya está procesado por uid de Gmail (dedupe por uid)
    const yaExiste = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM facturas_proveedor WHERE gmail_uid = ${correo.uid} AND cuenta_id = ${cuentaId}::uuid LIMIT 1`
    )
    if (yaExiste.length > 0) continue

    // 🚨 Tres desenlaces DISTINTOS, no dos: con datos / leído y no era factura /
    // no se pudo leer. El tercero es el que antes desaparecía en un `continue` mudo.
    //
    // Se prueban VARIOS adjuntos porque el bueno no tiene por qué ser el primero:
    // se para en cuanto uno da importe. Si ninguno lo da, el desenlace del correo
    // es «no se pudo leer» en cuanto UN intento fuera técnico — un logo legible no
    // autoriza a decir que el correo se ha revisado.
    let datos: Record<string, any> = {}
    let fallo: FalloExtraccion | null = null
    let huboFalloTecnico = false
    for (const adjunto of candidatos) {
      let d: Record<string, any> = {}
      let f: FalloExtraccion | null = null
      try {
        if (adjunto.mime === 'application/pdf') {
          const pdfParse: any = await import('pdf-parse/lib/pdf-parse.js')
          const parsed = await (pdfParse.default ?? pdfParse)(adjunto.buffer)
          ;({ datos: d, fallo: f } = await aiExtractInvoiceDetallado({ text: parsed.text }))
        } else if (adjunto.mime.startsWith('image/')) {
          const b64 = adjunto.buffer.toString('base64')
          ;({ datos: d, fallo: f } = await aiExtractInvoiceDetallado({ imageBase64: b64, mimeType: adjunto.mime }))
        } else {
          // Adjunto de un tipo que ni se intenta: leído y descartado, no es un fallo.
          f = 'sin_datos'
        }
      } catch (e) {
        // El PDF no se dejó abrir (cifrado, escaneado sin texto, corrupto): tampoco
        // se ha leído. No es «no era una factura».
        console.warn('[facturas] adjunto ilegible:', adjunto.nombre, String(e).slice(0, 120))
        d = {}
        f = 'tecnico'
      }
      if (f === 'tecnico') huboFalloTecnico = true
      // Un importe > 0 es la señal de que ESTE adjunto era la factura: se para aquí.
      if (typeof d.total === 'number' && d.total > 0) { datos = d; fallo = null; break }
      datos = d
      fallo = f
      if (deadline && Date.now() > deadline) break
    }
    if (fallo !== null && huboFalloTecnico) fallo = 'tecnico'

    if (fallo === 'tecnico') {
      sinLeer++
      // La etiqueta sobrevive al contenedor: el correo queda encolado y visible en
      // Gmail aunque nadie mire el latido. Best-effort (nunca tumba la pasada), pero
      // se CUENTA si de verdad se encoló: decir «etiquetado para reintentar» sin
      // comprobarlo es la misma mentira que este agente vino a quitar.
      if (await etiquetarCorreo(correo.uid, ETIQUETA_SIN_LEER, listado.buzon).catch(() => false)) encolados++
      continue
    }

    // Desenlace bueno (se leyó, sea factura o no): si el correo estaba en la cola de
    // «no se pudo leer» de días anteriores, deja de estarlo. Se acumula y se limpia
    // en UNA sola sesión IMAP al final.
    if (correo.messageId) resueltos.push(correo.messageId)

    const proveedor = (datos.proveedor as string | null) || correo.from.split('<')[0].trim() || 'Proveedor desconocido'
    const importe = typeof datos.total === 'number' ? datos.total : null
    if (!importe || importe <= 0) { descartados++; continue }

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

    await marcarProcesado(correo.uid, ETIQUETA_GMAIL, listado.buzon).catch(() => {})

    // Notificar por Telegram con botones de acción
    await notificarFactura(facturaId, proveedor, importe, fechaVenc, cuentaId)
    // Idea #11: proponer vínculo con reserva cercana
    await proponerVinculoReserva(facturaId, proveedor, fechaFactura).catch(() => {})
  }

  // La cola de «no se pudo leer» se VACÍA de lo ya resuelto: si no, un correo que
  // falló ayer y hoy se leyó bien seguiría etiquetado como fallido para siempre.
  // Best-effort y en una sola sesión IMAP; nunca tumba la pasada.
  if (resueltos.length > 0) await quitarEtiqueta(resueltos, ETIQUETA_SIN_LEER).catch(() => 0)

  return { nuevas, ok, error, pendientes, sinLeer, descartados, encolados }
}

async function notificarFactura(
  facturaId: string,
  proveedor: string,
  importe: number,
  fechaVenc: string | null,
  cuentaId: string,
): Promise<void> {
  const vence = fechaVenc ? ` · vence ${fechaVenc}` : ''

  // Idea #4: mostrar gasto acumulado del año y presupuesto si existe
  let budgetLinea = ''
  try {
    const rows = await prisma.$queryRaw<{ gastado: number; budget_anual: number | null }[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(fp.importe), 0)::float AS gastado,
        MAX(pp.budget_anual)::float AS budget_anual
      FROM facturas_proveedor fp
      LEFT JOIN presupuesto_proveedores pp
        ON pp.cuenta_id = ${cuentaId}::uuid
        AND pp.proveedor = ${proveedor}
        AND pp.anno = EXTRACT(YEAR FROM NOW())::int
      WHERE fp.cuenta_id = ${cuentaId}::uuid
        AND fp.proveedor = ${proveedor}
        AND EXTRACT(YEAR FROM fp.created_at) = EXTRACT(YEAR FROM NOW())
        AND fp.estado != 'rechazada'
    `)
    const r = rows[0]
    if (r?.budget_anual) {
      const pct = Math.round((r.gastado / r.budget_anual) * 100)
      budgetLinea = `\n<i>${proveedor} lleva ${eur(r.gastado)} este año (budget ${eur(r.budget_anual)} · ${pct}%)</i>`
    }
  } catch { /* no crítico */ }

  const texto = `🧾 <b>${proveedor}</b> · ${eur(importe)}${vence}${budgetLinea}`
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
    const msgId = await tgAvisoBotones('facturas.pago-aprobar', texto, botones)
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
    const redirectUrl = `${baseUrl()}/api/banca/pago/callback?facturaId=${facturaId}`
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

// ── Pagar todas las facturas pendientes de una cuenta (Idea #3) ───────────────

export async function pagarTodo(cuentaId: string): Promise<{ ok: number; error: number }> {
  const facturas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid AND estado IN ('nueva', 'pendiente_revision')
  `)
  const debtorIban = process.env.EB_DEBTOR_IBAN ?? ''
  let ok = 0, error = 0
  for (const f of facturas) {
    const result = await aprobarPago(f.id, cuentaId, debtorIban).catch(() => ({ ok: false as const }))
    if (result.ok) ok++; else error++
  }
  return { ok, error }
}

// ── Resumen semanal agrupado (Idea #3, lunes 09:00) ───────────────────────────

export async function resumenSemanal(cuentaId: string): Promise<boolean> {
  const facturas = await prisma.$queryRaw<{
    id: string; proveedor: string; importe: number; fecha_vencimiento: string | null
  }[]>(Prisma.sql`
    SELECT id, proveedor, importe::float, fecha_vencimiento::text
    FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid
      AND estado IN ('nueva', 'pendiente_revision')
    ORDER BY fecha_vencimiento ASC NULLS LAST, created_at ASC
  `)
  if (facturas.length <= 1) return false

  const total = facturas.reduce((s, f) => s + f.importe, 0)
  const lineas = facturas.slice(0, 5).map(f => {
    const vence = f.fecha_vencimiento ? ` · vence ${f.fecha_vencimiento}` : ''
    return `  • ${f.proveedor} · ${eur(f.importe)}${vence}`
  })
  if (facturas.length > 5) lineas.push(`  <i>... y ${facturas.length - 5} más</i>`)

  const texto = `📋 <b>${facturas.length} facturas pendientes esta semana:</b>\n${lineas.join('\n')}\n<b>Total: ${eur(total)}</b>`
  await tgAvisoBotones('facturas.pagos-resumen-semanal', texto, [[
    { texto: '✅ Pagar todo', callback: `pago_pagartodo:${cuentaId}` },
    { texto: '📋 Revisar una a una', callback: `pago_revisarunauna:${cuentaId}` },
  ]])
  return true
}

// ── Alertar si falta factura recurrente (Idea #2, día 7+ del mes) ─────────────

export async function alertarFacturasAusentes(cuentaId: string): Promise<number> {
  const hoy = new Date()
  if (hoy.getDate() < 7) return 0

  const recurrentes = await prisma.$queryRaw<{ proveedor: string; meses: bigint }[]>(Prisma.sql`
    SELECT proveedor, COUNT(DISTINCT DATE_TRUNC('month', created_at)) AS meses
    FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid
      AND created_at < DATE_TRUNC('month', NOW())
      AND estado != 'rechazada'
    GROUP BY proveedor
    HAVING COUNT(DISTINCT DATE_TRUNC('month', created_at)) >= 2
  `)

  let alertas = 0
  for (const p of recurrentes) {
    const hayEste = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS n FROM facturas_proveedor
      WHERE cuenta_id = ${cuentaId}::uuid
        AND proveedor = ${p.proveedor}
        AND created_at >= DATE_TRUNC('month', NOW())
        AND estado != 'rechazada'
    `)
    if (Number(hayEste[0]?.n ?? 0) === 0) {
      await tgAviso('facturas.proveedor-ausente', `⚠️ Sin factura de <b>${p.proveedor}</b> este mes (lleva ${Number(p.meses)} meses seguidos)`).catch(() => {})
      alertas++
    }
  }
  return alertas
}

// ── Proponer vínculo con reserva cercana (Idea #11) ───────────────────────────

async function proponerVinculoReserva(
  facturaId: string,
  proveedor: string,
  fechaFactura: string | null,
): Promise<void> {
  if (!fechaFactura) return
  const reservas = await prisma.$queryRaw<{
    propertyId: string; propertyName: string; guestName: string; checkOut: string
  }[]>(Prisma.sql`
    SELECT i."propertyId", COALESCE(p.name, i."propertyId") AS "propertyName",
           i."guestName", i."checkOut"::date::text AS "checkOut"
    FROM incomes i
    LEFT JOIN properties p ON p.id = i."propertyId"
    WHERE i."checkOut"::date BETWEEN ${fechaFactura}::date - INTERVAL '2 days'
                                 AND ${fechaFactura}::date + INTERVAL '2 days'
      AND i."propertyId" NOT LIKE '%personal%'
    ORDER BY ABS(EXTRACT(EPOCH FROM (i."checkOut"::date - ${fechaFactura}::date))) ASC
    LIMIT 1
  `)
  if (!reservas.length) return
  const r = reservas[0]
  const reservaRef = `${r.propertyId}:${r.checkOut}`
  const texto = `🔗 <b>${proveedor}</b> — ¿asociar con estancia de <i>${r.guestName}</i> en <i>${r.propertyName}</i> (salida ${r.checkOut})?`
  await tgAvisoBotones('facturas.pagos-resumen-semanal', texto, [[
    { texto: '✅ Sí, vincular', callback: `pago_vincular:${facturaId}:${reservaRef}` },
    { texto: '❌ No', callback: `pago_novinc:${facturaId}` },
  ]])
}

// ── Helpers internos ──────────────────────────────────────────────────────────

async function actualizarMensajeTg(msgId: number | null, texto: string): Promise<void> {
  if (!msgId) return
  try {
    await tgEditMessage(msgId, texto)
  } catch { /* Telegram no crítico */ }
}
