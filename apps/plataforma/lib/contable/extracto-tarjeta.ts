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
import { parseTarjetaPdfTexto, cuadrarExtractoTarjeta, esPagoReciboTarjeta } from '@/lib/extracto-tarjeta-pdf'
import { casarDevolucion, type CompraCandidata } from '@/lib/devoluciones-tarjeta'

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

// Procesa un extracto de tarjeta subido al chat/Telegram. `texto` ya viene extraído del PDF.
export async function procesarExtractoTarjeta(
  cuentaId: string, buffer: Buffer, mimeType: string, fileName: string, texto: string,
): Promise<ResultadoExtractoTarjeta> {
  const extractos = parseTarjetaPdfTexto(texto)
  if (!extractos.length || !extractos[0].movimientos.length) {
    return { ok: false, motivo: 'Parece un extracto de tarjeta pero no pude leer los movimientos. ¿Es el PDF "Movimientos de tarjeta" de Kutxabank?' }
  }

  const st = await resolverSociedadTitular(cuentaId, extractos[0].ccc)
  if (!st) return { ok: false, motivo: 'No encuentro una sociedad donde dar de alta la tarjeta. Créala en /banca y reinténtalo.' }

  const res = await importarExtracto(cuentaId, st.sociedadId, extractos, 'pdf', st.titular, 'tarjeta')
  await analizarMovimientos(cuentaId).catch(() => ({ categorizados: 0 }))

  const desde = res.fechaInicio || extractos[0].fechaInicio || new Date().toISOString().slice(0, 10)
  const hasta = res.fechaFin || extractos[0].fechaFin || desde
  const dev = await emparejarDevoluciones(res.cuentaBancariaIds, desde, hasta).catch(() => ({ casadas: 0, sinCasar: 0 }))

  // Cuadre: la liquidación (PAGO RECIBO) debe igualar Σ compras − Σ devoluciones.
  let cuadraTodo = true
  let liquidacion: number | null = null
  let diferencia = 0
  for (const ex of extractos) {
    const c = cuadrarExtractoTarjeta(ex)
    if (c.liquidacion !== null) liquidacion = (liquidacion ?? 0) + c.liquidacion
    if (!c.cuadra) { cuadraTodo = false; diferencia += c.diferencia }
  }

  // Resumen por Telegram (deducible/no + dudosas por movimiento) del mes importado.
  const mes = desde.slice(0, 7)
  await enviarResumenTarjeta(cuentaId, res.cuentaBancariaIds, mes).catch(() => {})

  // Archivar el PDF en Drive (año/mes), consultable como justificante.
  let driveUrl: string | undefined
  try {
    const d = await subir(buffer, fileName || `extracto-tarjeta-${mes}.pdf`, mimeType || 'application/pdf', hasta)
    driveUrl = d?.url
  } catch { /* no romper el import si Drive falla */ }

  const mascara = extractos[0].ccc.length >= 4 ? `****${extractos[0].ccc.slice(-4)}` : extractos[0].ccc
  const cuadreLinea = liquidacion === null
    ? ''
    : cuadraTodo
      ? `✅ Cuadra con la liquidación de ${eur(liquidacion)}.`
      : `⚠️ OJO: el desglose NO cuadra con la liquidación (faltan ${eur(diferencia)}). ¿Faltan páginas o es otro mes?`
  // Descuadre = probablemente faltan páginas / mes equivocado: avisa también al móvil (Telegram).
  if (liquidacion !== null && !cuadraTodo) {
    await tgSend(`💳 <b>Extracto ${escapeHtml(mascara)}: el desglose NO cuadra</b>\nFaltan ${eur(diferencia)} respecto a la liquidación. Revisa si el PDF está completo o es el mes correcto.`).catch(() => {})
  }
  const devLinea = dev.casadas || dev.sinCasar
    ? `↩️ Devoluciones: ${dev.casadas} emparejadas${dev.sinCasar ? `, ${dev.sinCasar} por confirmar en Telegram` : ''}.`
    : ''
  const driveLinea = driveUrl ? '📁 Archivado en Drive.' : '⚠️ No pude archivarlo en Drive (los movimientos sí están dentro).'

  const resumen = [
    `💳 Extracto de la tarjeta ${mascara} importado: ${res.insertados} movimientos nuevos${res.duplicados ? ` (${res.duplicados} ya estaban)` : ''}.`,
    cuadreLinea,
    devLinea,
    'Te mando por Telegram el desglose (deducible / no) y las dudosas para que confirmes.',
    driveLinea,
  ].filter(Boolean).join('\n')

  return { ok: true, tipo: 'extracto_tarjeta', resumen, driveUrl }
}
