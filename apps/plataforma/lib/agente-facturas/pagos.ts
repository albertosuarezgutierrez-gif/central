// Orquestador del agente de pago de facturas a proveedores.
// Flujo: Gmail → OCR → Telegram con botones → Enable Banking PIS o SEPA XML fallback.
// Requiere: GMAIL_USER, GMAIL_APP_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
// PIS activo cuando EB_PIS_ENABLED=true + ENABLEBANKING_APP_ID + ENABLEBANKING_PRIVATE_KEY.

import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { Prisma } from '@prisma/client'
import { listarCandidatosConLimite, marcarProcesado, etiquetarCorreo, quitarEtiqueta, type ListadoCandidatos } from './gmail'
import { ordenarAdjuntosFactura } from './elegir-adjuntos'
import { decidirAvisoPago } from './filtro-pago'
import { calcularIvaFactura } from './iva'
import { callbackIva, ofrecerSinIvaExtranjero } from './anomalia-callbacks'
import { pareceIngresoDeCorreduria } from './no-es-gasto'
import { cargarTitulares } from './titulares'
import type { Titular } from './receptor'
import { aiExtractInvoiceDetallado, type FalloExtraccion } from '@/lib/ai-client'
import { tgAviso, tgAvisoBotones, tgEditMessage } from '@/lib/telegram'
import { iniciarPago, estadoPago, disponiblePis } from '@/lib/enablebanking'
import type { EstadoPagoEB } from '@/lib/enablebanking'
import { baseUrl } from '@/lib/base-url'
import type { FacturaProveedor } from '@central/module-pagos'
import { clasificarFormaPago, claveProveedor, claveUtil, clavesDeTitulares, CLAVES_GENERICAS, RE_CONCEPTO_TRANSFERENCIA_SQL, planificarAviso, hayCoberturaTotal, componerTexto, hayAviso, type FormaPago, type FacturaResumen } from './forma-pago'
import { asignarCargos, toleranciaFactura } from './casar-cargos'
import { normalizarDivisa } from './divisa'
import { coberturaPorCuenta } from './anomalias'

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
  /** Se cargan al primer candidato con importe (una consulta por pasada). */
  let titulares: Titular[] | undefined

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

    // Una indemnización/liquidación de mediador es un COBRO, nunca algo que pagar ni un gasto.
    const noGasto = pareceIngresoDeCorreduria({ proveedor, concepto: (datos.concepto as string | null) || undefined })
    if (noGasto.esSospechoso) {
      console.log(`[facturas] apartada (no es un gasto): ${proveedor} · ${importe} — ${noGasto.motivo}`)
      descartados++
      continue
    }

    // Leída y con importe, pero ¿es algo que haya que PAGAR? (ver `filtro-pago.ts`)
    titulares ??= await cargarTitulares()
    const decision = decidirAvisoPago(datos, titulares)
    if (!decision.pagar) {
      console.log(`[facturas] apartada (${decision.motivo}): ${proveedor} · ${importe} — ${decision.detalle}`)
      descartados++
      continue
    }

    // IVA: si la IA no lo leyó, queda null (no 21, no 0): ver `iva.ts`. El IVA trimestral solo
    // suma filas con `cuota_iva IS NOT NULL`.
    const { ivaPct, cuotaIva } = calcularIvaFactura(importe, datos.iva_porcentaje)

    const numeroFactura = (datos.numero_factura as string | null) || null
    const concepto = (datos.concepto as string | null) || correo.subject || null
    const fechaFactura = (datos.fecha as string | null) || correo.fecha
    const fechaVenc = (datos.fecha_vencimiento as string | null) || null
    const ibanProv = (datos.iban as string | null) || null
    // Divisa del importe guardado (= `total`). null si la IA no la da o no es válida: nunca 'EUR' por defecto.
    const divisa = normalizarDivisa(datos.divisa)

    // Dedupe por número de factura (la constraint del índice único lo garantiza).
    // Si hay conflicto, skip silencioso.
    let facturaId: string | null = null
    try {
      const res = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO facturas_proveedor
          (cuenta_id, proveedor, concepto, importe, fecha_factura, fecha_vencimiento,
           numero_factura, iban_proveedor, estado, gmail_uid, iva_porcentaje, cuota_iva, origen, divisa)
        VALUES
          (${cuentaId}::uuid, ${proveedor}, ${concepto}, ${importe}::numeric,
           ${fechaFactura}::date, ${fechaVenc ? fechaVenc : null}::date,
           ${numeroFactura}, ${ibanProv}, 'nueva', ${correo.uid}, ${ivaPct}::numeric,
           ${cuotaIva}::numeric, 'gmail', ${divisa})
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
    const ivaDudoso = ofrecerSinIvaExtranjero(ivaPct, { nif_proveedor: datos.nif_proveedor as string | null, proveedor })
    await notificarFactura(facturaId, proveedor, importe, fechaVenc, cuentaId, decision.permitirPagar, decision.motivoRevision, ivaDudoso)
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
  permitirPagar = true,
  motivoRevision: 'sin_numero_ni_iva' | 'tipo_dudoso' = 'sin_numero_ni_iva',
  ivaDudoso = false,
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

  // 🚨 Una factura que se cobra SOLA (domiciliada/tarjeta/plataforma) no se «paga»: sin botón Pagar.
  const forma = (await formasPago(cuentaId, [proveedor])).get(proveedor) ?? 'desconocida'
  const sola = forma === 'cargo_automatico' || forma === 'plataforma'
  const permitirPagarOriginal = permitirPagar
  if (sola) permitirPagar = false
  const prefijo = prefijoAviso(forma, permitirPagarOriginal, motivoRevision)
  const texto = `${prefijo}🧾 <b>${proveedor}</b> · ${eur(importe)}${vence}${budgetLinea}`
  const botones = sola
    ? [[{ texto: '❌ Rechazar', callback: `pago_rechazar:${facturaId}` }]]
    : permitirPagar
    ? [
        [
          { texto: '✅ Pagar', callback: `pago_aprobar:${facturaId}` },
          { texto: '⏳ Aplazar', callback: `pago_aplazar:${facturaId}` },
        ],
        [
          { texto: '❌ Rechazar', callback: `pago_rechazar:${facturaId}` },
        ],
      ]
    : [
        [
          { texto: '⏳ Aplazar', callback: `pago_aplazar:${facturaId}` },
          { texto: '❌ Rechazar', callback: `pago_rechazar:${facturaId}` },
        ],
      ]
  // IVA no leído de un proveedor extranjero: se decide aquí, en el mismo aviso (nunca en el escaneo).
  if (ivaDudoso) {
    botones.push([
      { texto: '🌍 Sin IVA (extranjero)', callback: callbackIva('sin', facturaId) },
      { texto: '🔍 Revisar', callback: callbackIva('rev', facturaId) },
    ])
  }
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

/** IVA 0 de un proveedor extranjero. Solo si seguía sin leer (null): nunca pisa un dato. */
export async function aplicarSinIvaExtranjero(facturaId: string): Promise<boolean> {
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE facturas_proveedor SET iva_porcentaje = 0, cuota_iva = 0
    WHERE id = ${facturaId}::uuid AND cuota_iva IS NULL AND iva_porcentaje IS NULL
  `)
  return (n as any) > 0
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
// Cruza facturas_proveedor sin pagar con v_movimientos_activos por proveedor +
// importe (±3%) + fecha. Si encuentra el cargo, marca pagada.
//
// 🚨 Incluye 'nueva' y 'pendiente_revision', no solo las aprobadas: la mayoría de
// facturas del buzón (SaaS, suministros, lavandería) se cobran SOLAS por tarjeta o
// recibo y nunca pasan por «Aprobar». Sin esto se quedaban pendientes para siempre
// —58 el 29/09/2026— y el «Pagar todo» del resumen semanal las habría pagado dos veces.
//
// El proveedor se compara por su PRIMERA PALABRA significativa: el banco escribe
// «ANTHROPIC IRELAND» y la factura «Anthropic Ireland, Limited», y el nombre entero
// no casaba nunca. Palabras genéricas (fundación, comunidad…) y claves de <4 letras
// no se usan: casarían con cargos de otros. Un cargo solo paga UNA factura (la más
// cercana en fecha).

export async function conciliarConBanco(cuentaId: string): Promise<number> {
  // Candidatos SIN elegir en SQL: la asignación 1:1 global la hace `casar-cargos.ts` (puro, con test).
  // El SQL solo acota con la ventana más ancha (±15 %, por las facturas en USD); la tolerancia real
  // de cada factura se aplica en TS.
  const cands = await prisma.$queryRaw<{
    factura_id: string; telegram_msg_id: number | null; movimiento_id: string
    dist: number; ratio: number; proveedor: string; divisa: string | null
  }[]>(Prisma.sql`
    WITH fp AS (
      SELECT f.id, f.telegram_msg_id, f.importe, f.proveedor,
             to_jsonb(f)->>'divisa' AS divisa,
             COALESCE(f.fecha_vencimiento, f.fecha_factura, NOW()::date) AS ref,
             upper(split_part(trim(regexp_replace(
               translate(f.proveedor, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'), '[^A-Za-z ]', '', 'g')), ' ', 1)) AS clave
      FROM facturas_proveedor f
      WHERE f.cuenta_id = ${cuentaId}::uuid
        AND f.estado IN ('nueva', 'pendiente_revision', 'aprobada', 'pago_iniciado')
        AND f.importe > 0
    )
    SELECT fp.id::text AS factura_id, fp.telegram_msg_id, mb.id::text AS movimiento_id,
           ABS(mb.fecha_operacion - fp.ref)::int AS dist,
           (ABS(mb.importe) / fp.importe)::float AS ratio,
           fp.proveedor, fp.divisa
    FROM fp
    JOIN v_movimientos_activos mb
      ON ABS(mb.importe) BETWEEN fp.importe * 0.85 AND fp.importe * 1.15
      AND mb.importe < 0
      AND mb.conciliado IS NOT TRUE -- un cargo ya conciliado por otra vía no paga otra factura
      AND mb.fecha_operacion BETWEEN fp.ref - 10 AND fp.ref + 30
      AND (
        upper(translate(mb.concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || fp.clave || '%'
        OR upper(translate(COALESCE(mb.concepto_normalizado, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || fp.clave || '%'
        OR upper(translate(COALESCE(mb.contraparte, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || fp.clave || '%'
      )
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id AND cb.cuenta_id = ${cuentaId}::uuid
    WHERE length(fp.clave) >= 4
      AND fp.clave NOT IN (${Prisma.join(CLAVES_GENERICAS)})
  `)
  const msgPorFactura = new Map(cands.map(c => [c.factura_id, c.telegram_msg_id]))
  const pares = asignarCargos(cands.map(c => ({
    factura_id: c.factura_id, movimiento_id: c.movimiento_id, dist: c.dist, ratio: c.ratio,
    tolerancia: toleranciaFactura(c.proveedor, c.divisa),
  })))
  if (pares.length === 0) return 0

  const conciliadas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE facturas_proveedor f
    SET estado = 'pagada', pago_confirmado_at = NOW()
    WHERE f.cuenta_id = ${cuentaId}::uuid
      AND f.id = ANY(${pares.map(p => p.factura_id)}::uuid[])
      AND f.estado IN ('nueva', 'pendiente_revision', 'aprobada', 'pago_iniciado')
    RETURNING f.id::text
  `)
  for (const row of conciliadas) {
    await actualizarMensajeTg(msgPorFactura.get(row.id) ?? null, `✅ Pago conciliado con el extracto bancario.`)
  }
  return conciliadas.length
}

// ── Pagar todas las facturas pendientes de una cuenta (Idea #3) ───────────────

export async function pagarTodo(cuentaId: string): Promise<{ ok: number; error: number }> {
  const facturas = await prisma.$queryRaw<{ id: string; proveedor: string }[]>(Prisma.sql`
    SELECT id, proveedor FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid AND estado IN ('nueva', 'pendiente_revision')
  `)
  // 🚨 Solo las que exigen transferencia: lo domiciliado/tarjeta/plataforma o sin forma conocida NO se paga a mano.
  const formas = await formasPago(cuentaId, facturas.map(f => f.proveedor))
  const aPagar = facturas.filter(f => formas.get(f.proveedor) === 'transferencia')
  const debtorIban = process.env.EB_DEBTOR_IBAN ?? ''
  let ok = 0, error = 0
  for (const f of aPagar) {
    const result = await aprobarPago(f.id, cuentaId, debtorIban).catch(() => ({ ok: false as const }))
    if (result.ok) ok++; else error++
  }
  return { ok, error }
}

// ── Resumen semanal agrupado (Idea #3, lunes 09:00) ───────────────────────────

/**
 * Forma de pago deducida por proveedor: domiciliación explícita en lo ya leído (`gastos.raw_extraction`)
 * + histórico de cargos del proveedor en el banco (transferencia vs recibo/tarjeta). Un fallo de lectura
 * deja `desconocida` (no inventa una obligación de pago).
 */
/** Prefijo del aviso: «se cobra sola» y «revisar documento» CONVIVEN (la revisión no se pisa). */
export function prefijoAviso(forma: FormaPago, permitirPagar: boolean, motivoRevision: 'sin_numero_ni_iva' | 'tipo_dudoso'): string {
  const sola = forma === 'cargo_automatico' || forma === 'plataforma'
  const revisar = permitirPagar ? '' : motivoRevision === 'tipo_dudoso' ? '⚠️ Revisar: documento dudoso\n' : '⚠️ Revisar: sin nº de factura ni IVA\n'
  const aviso = sola ? `🏦 Se cobra sola (${forma === 'plataforma' ? 'la plataforma lo descuenta' : 'banco/tarjeta'}): no hay que pagarla\n` : ''
  return revisar + aviso
}

async function formasPago(cuentaId: string, proveedores: string[]): Promise<Map<string, FormaPago>> {
  const out = new Map<string, FormaPago>()
  const titulares = await cargarTitulares().catch(() => [] as Titular[])
  const excluidas = clavesDeTitulares(titulares.map(t => t.nombre))
  for (const prov of new Set(proveedores)) {
    const clave = claveProveedor(prov)
    let dom: boolean | null = null
    let auto = 0
    let transf = 0
    try {
      const g = await prisma.$queryRaw<{ si: bigint; no: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE raw_extraction->>'domiciliado' = 'true') AS si,
               COUNT(*) FILTER (WHERE raw_extraction->>'domiciliado' = 'false') AS no
        FROM gastos g
        WHERE g.proveedor = ${prov}
          AND (to_jsonb(g)->>'sociedad_id' IS NULL
               OR (to_jsonb(g)->>'sociedad_id')::uuid IN (SELECT s.id FROM sociedades s WHERE s.cuenta_id = ${cuentaId}::uuid))`)
      if (Number(g[0]?.si ?? 0) > 0) dom = true
      else if (Number(g[0]?.no ?? 0) > 0) dom = false
      if (claveUtil(clave, excluidas)) {
        const m = await prisma.$queryRaw<{ transf: bigint; auto: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE upper(mb.concepto) ~ ${RE_CONCEPTO_TRANSFERENCIA_SQL}) AS transf,
                 COUNT(*) FILTER (WHERE NOT upper(mb.concepto) ~ ${RE_CONCEPTO_TRANSFERENCIA_SQL}) AS auto
          FROM v_movimientos_activos mb
          JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id AND cb.cuenta_id = ${cuentaId}::uuid
          WHERE mb.importe < 0
            AND (upper(translate(mb.concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || ${clave} || '%'
              OR upper(translate(COALESCE(mb.contraparte, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || ${clave} || '%')`)
        auto = Number(m[0]?.auto ?? 0)
        transf = Number(m[0]?.transf ?? 0)
      }
    } catch { /* sin dato = desconocida */ }
    out.set(prov, clasificarFormaPago({ proveedor: prov, domiciliadoExplicito: dom, cargosAutomaticosPrevios: auto, transferenciasPrevias: transf }))
  }
  return out
}

export async function resumenSemanal(cuentaId: string): Promise<boolean> {
  // Primero se concilia: lo que el banco ya cargó deja de estar pendiente.
  await conciliarConBanco(cuentaId).catch(() => 0)
  const rows = await prisma.$queryRaw<{
    id: string; proveedor: string; importe: number; fecha_vencimiento: string | null
  }[]>(Prisma.sql`
    SELECT id, proveedor, importe::float, fecha_vencimiento::text
    FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid
      AND estado IN ('nueva', 'pendiente_revision')
    ORDER BY fecha_vencimiento ASC NULLS LAST, created_at ASC
  `)
  if (rows.length === 0) return false

  const formas = await formasPago(cuentaId, rows.map(r => r.proveedor))
  const facturas: FacturaResumen[] = rows.map(r => ({ ...r, forma: formas.get(r.proveedor) ?? 'desconocida' }))
  const hoy = new Date().toISOString().slice(0, 10)
  const cuentas = await coberturaPorCuenta(hoy, cuentaId, true).catch(() => null)
  const hayCobertura = (f: string) => hayCoberturaTotal(cuentas, f)
  const plan = planificarAviso(facturas, hoy, hayCobertura)
  if (!hayAviso(plan)) return false

  // Botones de pago SOLO si hay transferencias; nunca para lo que se cobra solo.
  const botones = plan.manuales.length > 0
    ? [[
        { texto: '✅ Pagar las transferencias', callback: `pago_pagartodo:${cuentaId}` },
        { texto: '📋 Revisar una a una', callback: `pago_revisarunauna:${cuentaId}` },
      ]]
    : []
  await tgAvisoBotones('facturas.pagos-resumen-semanal', componerTexto(plan), botones)
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
