// apps/plataforma/lib/contable/extracto-tarjeta.ts
// Flujo del agente para un EXTRACTO DE TARJETA subido al chat (📎): parsea el PDF (cifras exactas,
// no inventadas), lo importa como cuenta tipo='tarjeta' (dedupe idempotente), categoriza, empareja
// las DEVOLUCIONES con su compra original (para que se anulen en el deducible), comprueba el CUADRE
// (Σ compras − Σ devoluciones = liquidación) y ARCHIVA el PDF en Drive. Las dudosas se preguntan por
// Telegram (enviarResumenTarjeta / mov_*). Reutiliza todo el motor de banca; no duplica lógica.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgSend, tgSendButtons, escapeHtml } from '@central/core-telegram'
import { importarExtracto, enviarResumenTarjeta } from '@/lib/banca'
import { analizarMovimientos } from '@/lib/categorizar'
import { comercioDe } from '@/lib/comercio'
import { eur } from '@/lib/dinero'
import { subir } from '@/lib/agente-facturas/drive'
import { conciliarFacturasDesdeGmail } from '@/lib/agente-facturas/conciliar-gmail'
import { cuadrarExtractoTarjeta, esPagoReciboTarjeta } from '@/lib/extracto-tarjeta-pdf'
import type { ExtractoN43 } from '@/lib/norma43'
import { casarDevolucion, type CompraCandidata } from '@/lib/devoluciones-tarjeta'
import { esCargoFinanciero, dobleCobro, subioPrecio, baseRecurrente, type CargoPrevio } from '@/lib/vigilantes-tarjeta'
import { claveComercio } from '@/lib/comercio-canonico'
import { guardarEnlaceExtracto } from './memoria'
import { planificarPasos, lineaSaltados, RESERVA_RESPUESTA_MS } from './presupuesto-extracto'

export type ResultadoExtractoTarjeta =
  | { ok: false; motivo: string }
  | { ok: true; tipo: 'extracto_tarjeta'; resumen: string; driveUrl?: string }

// Resuelve la sociedad + titular de una tarjeta por su ccc (TARJETA-KUTXA-<últ.4>), reutilizando
// la cuenta bancaria que YA existe (ambas tarjetas están dadas de alta con su titular). Fallback a
// la primera sociedad de la cuenta. ⚠️ NO se filtra `cuentas` por `estado` (columna inexistente).
async function resolverSociedadTitular(
  cuentaId: string, ccc: string,
): Promise<{ sociedadId: string; titular: 'titular' | 'conyuge' } | null> {
  const existentes = await prisma.$queryRaw<Array<{ sociedad_id: string; titular: string | null }>>(Prisma.sql`
    SELECT sociedad_id, titular FROM cuentas_bancarias
    WHERE cuenta_id = ${cuentaId}::uuid AND iban = ${ccc} LIMIT 1
  `).catch(() => [])
  if (existentes[0]?.sociedad_id) {
    return { sociedadId: existentes[0].sociedad_id, titular: existentes[0].titular === 'conyuge' ? 'conyuge' : 'titular' }
  }
  const soc = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM sociedades WHERE cuenta_id = ${cuentaId}::uuid LIMIT 1
  `).catch(() => [])
  return soc[0]?.id ? { sociedadId: soc[0].id, titular: 'titular' } : null
}

// Empareja las devoluciones (abonos que no son PAGO RECIBO) con su compra original y les copia el
// destino para que se ANULEN en el cómputo por destino. Las que no casan → requiere_revision y un
// mensaje Telegram con botones (mov_*) para que Alberto las asigne. Devuelve el recuento.
async function emparejarDevoluciones(
  cuentaBancariaIds: string[], desde: string, hasta: string,
): Promise<{ casadas: number; sinCasar: number }> {
  if (!cuentaBancariaIds.length) return { casadas: 0, sinCasar: 0 }
  const abonos = await prisma.$queryRaw<Array<{ id: string; importe: number; concepto: string | null; contraparte: string | null; fecha: string }>>(Prisma.sql`
    SELECT id, importe::float AS importe, concepto, contraparte, fecha_operacion::text AS fecha
    FROM movimientos_bancarios
    WHERE cuenta_bancaria_id = ANY(${cuentaBancariaIds}::uuid[])
      AND importe > 0
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      AND coalesce(duplicado_estado, '') <> 'ignorado'
  `).catch(() => [])
  const devoluciones = abonos.filter(a => !esPagoReciboTarjeta(a.concepto))
  if (!devoluciones.length) return { casadas: 0, sinCasar: 0 }

  // Compras candidatas: cargos de las mismas tarjetas hasta 120 días antes del rango importado.
  const compras = await prisma.$queryRaw<Array<{ id: string; importe: number; concepto: string | null; contraparte: string | null; fecha: string; destino: string | null; propiedad_id: string | null }>>(Prisma.sql`
    SELECT id, importe::float AS importe, concepto, contraparte, fecha_operacion::text AS fecha, destino, propiedad_id
    FROM movimientos_bancarios
    WHERE cuenta_bancaria_id = ANY(${cuentaBancariaIds}::uuid[])
      AND importe < 0
      AND fecha_operacion >= (${desde}::date - INTERVAL '120 days')
      AND coalesce(duplicado_estado, '') <> 'ignorado'
  `).catch(() => [])
  const candidatas: CompraCandidata[] = compras.map(c => ({
    id: c.id, importe: c.importe, comercio: comercioDe(c.contraparte, c.concepto),
    fecha: c.fecha, destino: c.destino, propiedadId: c.propiedad_id,
  }))

  let casadas = 0, sinCasar = 0
  for (const d of devoluciones) {
    const match = casarDevolucion(
      { importe: d.importe, comercio: comercioDe(d.contraparte, d.concepto), fecha: d.fecha },
      candidatas,
    )
    if (match) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios
        SET destino = ${match.destino}, propiedad_id = ${match.propiedadId},
            destino_confirmado = true, requiere_revision = false,
            comentario = COALESCE(comentario || ' | ', '') || 'devolución casada con la compra'
        WHERE id = ${d.id}::uuid
      `).catch(() => {})
      casadas++
    } else {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios
        SET requiere_revision = true,
            comentario = COALESCE(comentario || ' | ', '') || 'devolución sin compra casada'
        WHERE id = ${d.id}::uuid AND destino_confirmado IS NOT TRUE
      `).catch(() => {})
      // Las devoluciones son abonos (importe > 0) y getMovimientosDudosos solo mira cargos, así que
      // las sacamos aquí con sus propios botones (asignar destino la anula contra su compra futura).
      const comercio = comercioDe(d.contraparte, d.concepto).slice(0, 40).toUpperCase() || 'DEVOLUCIÓN'
      await tgSendButtons(
        `↩️ <b>Devolución</b> · ${escapeHtml(comercio)} · ${d.fecha.slice(0, 10)} · +${eur(d.importe)}\n¿De qué negocio era la compra devuelta?`,
        [[
          { texto: '✅ Pisos', callback: `mov_pisos:${d.id}` },
          { texto: '✅ Correduría', callback: `mov_correduria:${d.id}` },
        ], [
          { texto: '❌ Personal', callback: `mov_personal:${d.id}` },
          { texto: '⏭️ Saltar', callback: `mov_saltar:${d.id}` },
        ]],
      ).catch(() => {})
      sinCasar++
    }
  }
  return { casadas, sinCasar }
}

// ── VIGILANTES (Fase 2): solo AVISAN sobre las compras del extracto, no bloquean ────────────────
const VIG_UMBRAL_NUEVO = 80        // € — cargo de comercio nunca visto que merece confirmación
const VIG_UMBRAL_JUSTIFICANTE = 100 // € — compra deducible grande sin factura
const VIG_MAX_LISTA = 5
const VIG_HIST_MESES = 24          // ventana del histórico con el que se decide "comercio nuevo"
const VIG_HIST_MAX = 20000         // techo de filas leídas; si se toca, el histórico está INCOMPLETO

async function vigilantesTarjeta(
  cuentaId: string, ids: string[], desde: string, hasta: string,
): Promise<void> {
  if (!ids.length) return
  const compras = await prisma.$queryRaw<Array<{ id: string; importe: number; concepto: string | null; contraparte: string | null; destino: string | null; fecha: string }>>(Prisma.sql`
    SELECT id, importe::float AS importe, concepto, contraparte, destino, fecha_operacion::text AS fecha
    FROM movimientos_bancarios
    WHERE cuenta_bancaria_id = ANY(${ids}::uuid[]) AND importe < 0
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      AND coalesce(duplicado_estado, '') <> 'ignorado'
  `).catch(() => [])
  if (!compras.length) return
  const conComercio = compras.map(c => ({ ...c, comercio: comercioDe(c.contraparte, c.concepto) }))

  // 1) Intereses / comisiones de la tarjeta (coste financiero evitable).
  const totalFinanc = conComercio.filter(c => esCargoFinanciero(c.concepto)).reduce((s, c) => s + Math.abs(c.importe), 0)

  // 2) Posible cobro doble (mismo comercio + mismo importe + MISMO DÍA; ver lib/vigilantes-tarjeta).
  const dobles = dobleCobro(conComercio
    .filter(c => !esCargoFinanciero(c.concepto))
    .map(c => ({ id: c.id, comercio: c.comercio, importe: c.importe, fecha: c.fecha })))

  // Histórico previo → "comercio nunca visto" y "subida de precio de recurrente".
  // 🚨 De TODA la cuenta, no solo de esta tarjeta: si Alberto ya compró en ese comercio pagando con
  // otra tarjeta o por transferencia, el comercio NO es nuevo. Mirar solo la tarjeta convertía un
  // «no lo he mirado en el resto de cuentas» en un «no lo reconozco». Lectura por la vista canónica
  // `v_movimientos_activos` (excluye duplicados) — regla de banca.
  type FilaPrevia = { importe: number; concepto: string | null; contraparte: string | null; fecha: string }
  let previos: FilaPrevia[] = []
  let historicoLeido = true
  try {
    previos = await prisma.$queryRaw<FilaPrevia[]>(Prisma.sql`
      SELECT mb.importe::float AS importe, mb.concepto, mb.contraparte, mb.fecha_operacion::text AS fecha
      FROM v_movimientos_activos mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.importe < 0
        AND mb.fecha_operacion < ${desde}::date
        AND mb.fecha_operacion >= (${desde}::date - (${VIG_HIST_MESES} || ' months')::interval)
      ORDER BY mb.fecha_operacion DESC
      LIMIT ${VIG_HIST_MAX + 1}
    `)
  } catch (e) {
    // Un histórico que NO se ha podido leer no es un histórico vacío: sin él no se puede decir ni
    // que un comercio sea nuevo ni que un precio haya subido. Se calla y se avisa del hueco.
    console.error('[vigilantesTarjeta] histórico', e)
    historicoLeido = false
  }
  // Si se toca el techo, el histórico está TRUNCADO: no se puede afirmar que un comercio sea nuevo
  // (podría estar en las filas que no se han leído). Se calla el aviso y se dice por qué.
  const historicoCompleto = historicoLeido && previos.length <= VIG_HIST_MAX

  const seen = new Set<string>()
  const previosPorComercio = new Map<string, CargoPrevio[]>()
  for (const p of previos.slice(0, VIG_HIST_MAX)) {
    const clave = claveComercio(comercioDe(p.contraparte, p.concepto))
    if (!clave) continue
    seen.add(clave)
    const arr = previosPorComercio.get(clave) ?? []
    arr.push({ importe: Math.abs(p.importe), fecha: p.fecha })
    previosPorComercio.set(clave, arr)
  }

  // 3) Cargos no reconocidos: comercio cuya IDENTIDAD (no su rótulo literal) no aparece en el
  //    histórico. Solo si hay histórico Y está completo; en el primer import todo sería "nuevo".
  const nuevos = (seen.size === 0 || !historicoCompleto) ? [] : conComercio
    .filter(c => !esCargoFinanciero(c.concepto) && Math.abs(c.importe) > VIG_UMBRAL_NUEVO
      && !!claveComercio(c.comercio) && !seen.has(claveComercio(c.comercio)))
    .sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe))
    .slice(0, VIG_MAX_LISTA)

  // 4) Subida de precio SOLO de recurrentes de importe estable (suscripción/cuota que sube). Un
  //    súper o un bar cobran distinto cada vez: ahí "subida" no significa nada (ver baseRecurrente).
  const subidas: Array<{ comercio: string; importe: number; base: number }> = []
  const yaAvisado = new Set<string>()   // un recurrente que se cobra 2 veces en el mes avisa 1 vez
  for (const c of conComercio) {
    const clave = claveComercio(c.comercio)
    if (!clave || yaAvisado.has(clave) || esCargoFinanciero(c.concepto)) continue
    const base = baseRecurrente(previosPorComercio.get(clave) ?? [])
    if (base !== null && subioPrecio(c.importe, base)) {
      subidas.push({ comercio: c.comercio, importe: Math.abs(c.importe), base })
      yaAvisado.add(clave)
    }
    if (subidas.length >= VIG_MAX_LISTA) break
  }

  // 5) Justificantes pendientes de compras deducibles grandes (enlaza con el Check 8 trimestral).
  const just = await prisma.$queryRaw<Array<{ n: bigint; total: number }>>(Prisma.sql`
    SELECT count(*) AS n, coalesce(sum(abs(importe)), 0)::float AS total
    FROM movimientos_bancarios
    WHERE cuenta_bancaria_id = ANY(${ids}::uuid[]) AND importe < 0
      AND destino IN ('turistico_pisos', 'turistico_duplex', 'seguros')
      AND abs(importe) > ${VIG_UMBRAL_JUSTIFICANTE}
      AND conciliado = false AND factura_ref IS NULL
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      AND coalesce(duplicado_estado, '') <> 'ignorado'
  `).catch(() => [])
  const justN = Number(just[0]?.n ?? 0)
  const justTotal = Number(just[0]?.total ?? 0)

  // Un solo mensaje Telegram con las secciones que tengan contenido (evita spam).
  const bloques: string[] = []
  if (totalFinanc > 0) bloques.push(`💸 <b>Intereses/comisiones</b>: la tarjeta te cobró ${eur(totalFinanc)} este mes. Liquidando en el mes te lo ahorras.`)
  if (dobles.length) bloques.push(`🔁 <b>Posible cobro doble</b> (mismo día):\n${dobles.slice(0, VIG_MAX_LISTA).map(d => `  · ${escapeHtml(d.comercio)}: ${d.ids.length}× ${eur(d.importe)} el ${d.fecha}`).join('\n')}`)
  if (nuevos.length) bloques.push(`🆕 <b>Comercio que no aparece en tus ${VIG_HIST_MESES} meses anteriores</b>:\n${nuevos.map(c => `  · ${escapeHtml(c.comercio)}: ${eur(Math.abs(c.importe))} (${c.fecha})`).join('\n')}\n¿Los reconoces?`)
  if (!historicoLeido) bloques.push('⚠️ No he podido leer tu histórico de movimientos, así que esta vez NO he revisado comercios nuevos ni subidas de precio. No es que no haya: es que no lo he podido mirar.')
  else if (!historicoCompleto) bloques.push(`⚠️ No repaso los comercios nuevos: tu histórico de ${VIG_HIST_MESES} meses supera lo que puedo leer de una vez, así que no puedo afirmar que un comercio sea nuevo.`)
  if (subidas.length) bloques.push(`📈 <b>Subidas de precio</b> (cargos recurrentes de importe fijo):\n${subidas.map(s => `  · ${escapeHtml(s.comercio)}: ${eur(s.base)} → ${eur(s.importe)}`).join('\n')}`)
  if (justN > 0) bloques.push(`🧾 <b>Justificantes pendientes</b>: ${justN} compra(s) deducible(s) por ${eur(justTotal)} sin factura. Consíguelas para Hacienda (/finanzas?tab=gastos).`)

  if (bloques.length) await tgSend(`🔎 <b>Revisión de la tarjeta</b>\n\n${bloques.join('\n\n')}`).catch(() => {})
}

// Procesa un extracto de tarjeta subido al chat/Telegram. Los movimientos llegan YA parseados: del
// PDF («Movimientos de tarjeta») o del Excel del mismo listado — el resto del flujo es idéntico, así
// que no se duplica (`origen` solo distingue la procedencia en la fila y el nombre en Drive).
// Techo de la ruta que llama (maxDuration=300 s) menos margen. Lo que importa no es el número: es que
// los pasos opcionales se suelten ANTES de quedarse sin aire, para que la pasada siempre responda.
const PRESUPUESTO_MS = 270_000

export async function procesarExtractoTarjeta(
  cuentaId: string, buffer: Buffer, mimeType: string, fileName: string,
  extractos: ExtractoN43[], origen: 'pdf' | 'xls' = 'pdf',
): Promise<ResultadoExtractoTarjeta> {
  const t0 = Date.now()
  const msRestantes = () => PRESUPUESTO_MS - (Date.now() - t0)
  if (!extractos.length || !extractos[0].movimientos.length) {
    return { ok: false, motivo: 'Parece un extracto de tarjeta pero no pude leer los movimientos. ¿Es el PDF/Excel "Movimientos de tarjeta" de Kutxabank?' }
  }

  const st = await resolverSociedadTitular(cuentaId, extractos[0].ccc)
  if (!st) return { ok: false, motivo: 'No encuentro una sociedad donde dar de alta la tarjeta. Créala en /banca y reinténtalo.' }

  const res = await importarExtracto(cuentaId, st.sociedadId, extractos, origen, st.titular, 'tarjeta')
  await analizarMovimientos(cuentaId).catch(() => ({ categorizados: 0 }))

  const desde = res.fechaInicio || extractos[0].fechaInicio || new Date().toISOString().slice(0, 10)
  const hasta = res.fechaFin || extractos[0].fechaFin || desde
  const dev = await emparejarDevoluciones(res.cuentaBancariaIds, desde, hasta).catch(() => ({ casadas: 0, sinCasar: 0 }))

  // Cuadre: la liquidación (PAGO RECIBO) debe igualar Σ compras − Σ devoluciones. Solo se afirma
  // cuando el extracto lo permite: si su liquidación paga el ciclo ANTERIOR (lo normal en el PDF de
  // Kutxabank, donde el PAGO RECIBO abre el mes), no hay nada que contrastar y no se dice nada.
  let cuadraTodo = true
  let verificable = false
  let liquidacion: number | null = null
  let diferencia = 0
  for (const ex of extractos) {
    const c = cuadrarExtractoTarjeta(ex)
    if (c.liquidacion !== null) liquidacion = (liquidacion ?? 0) + c.liquidacion
    if (c.verificable) verificable = true
    if (!c.cuadra) { cuadraTodo = false; diferencia += c.diferencia }
  }

  // A partir de aquí todo es OPCIONAL: el extracto ya está dentro y cuadrado. Lo que no quepa en el
  // tiempo que queda se suelta y se DICE (ver presupuesto-extracto.ts) — nunca se sacrifica la
  // respuesta, que es lo único que le dice a Alberto que su documento entró.
  const { hacer, saltados } = planificarPasos(msRestantes())

  // Resumen por Telegram (deducible/no + dudosas por movimiento) del mes importado.
  const mes = desde.slice(0, 7)
  if (hacer.telegram) await enviarResumenTarjeta(cuentaId, res.cuentaBancariaIds, mes).catch(() => {})

  // Vigilantes (Fase 2): intereses, cobro doble, cargos nuevos, subidas de precio, justificantes.
  if (hacer.vigilantes) await vigilantesTarjeta(cuentaId, res.cuentaBancariaIds, desde, hasta).catch(() => {})

  const pan4 = extractos[0].ccc.length >= 4 ? extractos[0].ccc.slice(-4) : ''

  // Archivar el PDF en Drive (año/mes), consultable como justificante. Al lograrlo, PERSISTIR el
  // enlace por tarjeta+mes (contable_memoria) para poder devolverlo a demanda desde el chat
  // ("enséñame el extracto de junio de la ****0302") — Fase 3, extracto consultable.
  let driveUrl: string | undefined
  if (hacer.drive) {
    try {
      const nombre = fileName || `extracto-tarjeta-${mes}.${origen === 'xls' ? 'xls' : 'pdf'}`
      const tipo = mimeType || (origen === 'xls' ? 'application/vnd.ms-excel' : 'application/pdf')
      const d = await subir(buffer, nombre, tipo, hasta)
      driveUrl = d?.url
      if (driveUrl && pan4) await guardarEnlaceExtracto(cuentaId, pan4, mes, driveUrl).catch(() => {})
    } catch { /* no romper el import si Drive falla */ }
  }

  // Auto-factura del correo (Fase 3): intenta enganchar YA los justificantes de las compras deducibles
  // recién importadas buscándolos en el Gmail de contabilidad (mismo motor conservador que el cron
  // diario — mismo signo + importe al céntimo + fecha en ventana, nunca a ciegas). Acotado para no
  // agotar el timeout; el cron diario recoge el resto. Best-effort: si falla, el import ya está hecho.
  let justificantes = 0
  try {
    if (!hacer.gmail) throw new Error('sin presupuesto')
    const c = await conciliarFacturasDesdeGmail(cuentaId, { mesesAtras: 2, maxAdjuntos: 8, tolDias: 10 })
    justificantes = c.enganchadas.length
    if (justificantes) {
      const imp = c.enganchadas.reduce((s, e) => s + e.importe, 0)
      await tgSend(`📎 <b>Justificantes enganchados</b>\n${justificantes} compra(s) de la tarjeta casada(s) con su factura del correo — ${eur(imp)}.`).catch(() => {})
    }
  } catch { /* best-effort: el cron diario lo reintenta */ }

  const mascara = pan4 ? `****${pan4}` : extractos[0].ccc
  const cuadreLinea = liquidacion === null
    ? ''
    : !verificable
      ? `ℹ️ La liquidación de ${eur(liquidacion)} de este extracto paga el ciclo anterior, así que no la contrasto con estas compras.`
      : cuadraTodo
        ? `✅ Cuadra con la liquidación de ${eur(liquidacion)}.`
        : `⚠️ OJO: el desglose NO cuadra con la liquidación (faltan ${eur(diferencia)}). ¿Faltan páginas o es otro mes?`
  // Descuadre = probablemente faltan páginas / mes equivocado: avisa también al móvil (Telegram).
  if (verificable && !cuadraTodo) {
    await tgSend(`💳 <b>Extracto ${escapeHtml(mascara)}: el desglose NO cuadra</b>\nFaltan ${eur(diferencia)} respecto a la liquidación. Revisa si el PDF está completo o es el mes correcto.`).catch(() => {})
  }
  const devLinea = dev.casadas || dev.sinCasar
    ? `↩️ Devoluciones: ${dev.casadas} emparejadas${dev.sinCasar ? `, ${dev.sinCasar} por confirmar en Telegram` : ''}.`
    : ''
  const driveLinea = driveUrl
    ? '📁 Archivado en Drive (consúltalo cuando quieras: «enséñame el extracto de ' + mes + '»).'
    : hacer.drive ? '⚠️ No pude archivarlo en Drive (los movimientos sí están dentro).' : ''
  const justLinea = justificantes ? `📎 ${justificantes} compra(s) ya tienen su factura del correo enganchada.` : ''
  const telegramLinea = hacer.telegram
    ? 'Te mando por Telegram el desglose (deducible / no) y las dudosas para que confirmes.'
    : ''

  const resumen = [
    `💳 Extracto de la tarjeta ${mascara} importado: ${res.insertados} movimientos nuevos${res.duplicados ? ` (${res.duplicados} ya estaban)` : ''}.`,
    cuadreLinea,
    devLinea,
    telegramLinea,
    justLinea,
    driveLinea,
    lineaSaltados(saltados),
  ].filter(Boolean).join('\n')

  return { ok: true, tipo: 'extracto_tarjeta', resumen, driveUrl }
}
