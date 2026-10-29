// lib/sivra/facturas/salida-auto.ts — EMITIR y ENVIAR SOLA la factura del huésped el día de salida (SERVIDOR).
//
// Lo dispara `/api/cron/sivra-facturas-salida` (una vez al día). Excepción a «nunca correo a terceros sin OK de
// Alberto», aprobada por él el 29/10/2026 y anotada en CLAUDE.md: SOLO la factura con datos validados, el día de salida.
//
// Por cada solicitud viva cuya reserva sale hoy (Madrid) o salió hace ≤ 30 días:
//   1) Si está pendiente y aún no se avisó: se intenta rellenar con lo que el huésped escribió en el chat (`chat.ts`).
//   2) Qué falta: receptor (`validarReceptor`), importe (`elegirTotal`), serie del año (`evaluarSerie`).
//   3) `decidirSalida` (puro, testeado) → emitir | enviar | avisar | nada.
//   4) emitir = borrador con esos datos (sin proponer en Telegram) → `emitirFactura(…, {automatico})` (FOR UPDATE:
//      dos pases a la vez no emiten dos veces) → `enviarFactura` (reclamo atómico: un solo correo, con CC) → informe
//      a Alberto con el botón 🔁 si el correo falló.
//   5) avisar = reclamo atómico de `auto_aviso_at` → UN Telegram con lo que falta. Si Telegram no lo entrega, se suelta
//      el reclamo para intentarlo en el siguiente pase.

import { Prisma } from '@prisma/client'
import { escapeHtml, type Boton } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { tgAviso, tgAvisoBotones } from '@/lib/telegram/avisos'
import { construirContexto } from '@/lib/sivra/agente-huesped/contexto'
import { elegirTotal } from './borrador'
import { emitirFactura, enviarFactura } from './emitir'
import { URL_PLATAFORMA_FACTURAS } from './enlace'
import { entradaReceptor, faltasDe, TEXTO_FALTA } from './extraer'
import { evaluarSerie, fechaMadrid } from './numeracion'
import { validarReceptor } from './receptor'
import { decidirSalida, restarDias, textoAvisoIncompleta, VENTANA_DIAS, type DecisionSalida } from './salida-decision'
import { leerReserva, prepararBorrador, serieDelAnio } from './servicio'
import { rellenarDesdeChat } from './chat'
import { botonesPropuesta } from './telegram'
import { lineaEnvio } from './telegram-acciones'

const MAX_POR_PASE = 20

export type ResultadoPase = { reservationId: string; accion: DecisionSalida['accion'] | 'error'; detalle: string }

type Candidata = { id: string; cuenta_id: string; reservation_id: string; estado: string; aviso: string | null }

export async function candidatas(ahora: Date): Promise<Candidata[]> {
  const hoy = fechaMadrid(ahora).iso
  const desde = restarDias(hoy, VENTANA_DIAS)
  // El LIMIT no debe llenarse de solicitudes que hoy acaban en «nada»: se excluyen las emitidas con envío ya intentado
  // (lo decide Alberto) y las ya avisadas van AL FINAL (no se excluyen: si el huésped completó los datos tras el aviso,
  // `decidirSalida` las emite).
  // `checkOut` es timestamptz a las 00:00 UTC (fecha de calendario): se compara su fecha UTC, igual que `leerReserva`.
  return prisma.$queryRaw<Candidata[]>(Prisma.sql`
    SELECT s.id::text, s.cuenta_id::text, s.reservation_id, s.estado, to_jsonb(s) ->> 'auto_aviso_at' AS aviso
      FROM sivra_factura_solicitudes s
     WHERE s.estado <> 'cancelada'
       AND EXISTS (SELECT 1 FROM incomes i WHERE i."reservationId" = s.reservation_id
                     AND (i."checkOut" AT TIME ZONE 'UTC')::date BETWEEN ${desde}::date AND ${hoy}::date)
       AND NOT EXISTS (SELECT 1 FROM sivra_facturas_huesped f WHERE f.reservation_id = s.reservation_id
                         AND f.tipo = 'ordinaria' AND f.estado IN ('enviada', 'rectificada'))
       AND NOT EXISTS (SELECT 1 FROM sivra_facturas_huesped f WHERE f.reservation_id = s.reservation_id
                         AND f.tipo = 'ordinaria' AND f.estado = 'emitida' AND f.envio_intentos > 0)
     ORDER BY (to_jsonb(s) ->> 'auto_aviso_at') IS NOT NULL, s.created_at
     LIMIT ${MAX_POR_PASE}`)
}

/** `simular`: calcula la decisión sin escribir nada, sin IA y sin enviar (para ver qué haría). */
export async function procesarSalidas(ahora: Date = new Date(), opts: { simular?: boolean } = {}): Promise<ResultadoPase[]> {
  const out: ResultadoPase[] = []
  for (const c of await candidatas(ahora)) {
    try {
      out.push(await procesarUna(c, ahora, opts.simular === true))
    } catch (e) {
      console.error(`[facturas-salida] reserva ${c.reservation_id}:`, e instanceof Error ? e.message : e)
      out.push({ reservationId: c.reservation_id, accion: 'error', detalle: e instanceof Error ? e.message.slice(0, 200) : 'error' })
    }
  }
  return out
}

async function procesarUna(c: Candidata, ahora: Date, simular: boolean): Promise<ResultadoPase> {
  const rid = c.reservation_id
  // 1) Datos del chat (solo pendiente, sin aviso previo; nunca pisa lo ya puesto).
  if (!simular && c.estado === 'pendiente' && !c.aviso) {
    try {
      const ctx = await construirContexto(rid, 'es')
      const textos = ctx ? ctx.historial.filter((h) => h.from === 'guest').map((h) => h.text) : []
      if (textos.length) await rellenarDesdeChat(c.id, textos, ahora)
    } catch (e) {
      console.warn(`[facturas-salida] reserva ${rid}: no se pudo leer el chat:`, e instanceof Error ? e.message.slice(0, 120) : 'error')
    }
  }

  // 2) Qué falta.
  const s = await prisma.sivraFacturaSolicitud.findUnique({ where: { id: c.id } })
  if (!s) return { reservationId: rid, accion: 'nada', detalle: 'solicitud desaparecida' }
  const reserva = await leerReserva(rid)
  const faltan: string[] = []
  if (!reserva) faltan.push('la reserva aparece duplicada (o ya no está) en incomes: no se factura a ciegas')
  const v = validarReceptor(entradaReceptor(s))
  if (!v.ok) faltan.push(...faltasDe(v.errores).map((k) => `${TEXTO_FALTA[k]} del huésped`))
  const fx = await prisma.sivraFacturaHuesped.findFirst({
    where: { reservationId: rid, tipo: 'ordinaria', estado: { not: 'rectificada' } },
    select: { id: true, estado: true, envioIntentos: true, total: true, totalManual: true, numeroCompleto: true },
  })
  if (reserva && elegirTotal({ totalReserva: reserva.total, existente: fx ? { total: Number(fx.total), manual: fx.totalManual } : null }) === null) {
    faltan.push('el importe (amount_gross vacío o 0 en incomes): ponlo a mano')
  }
  const { anio } = fechaMadrid(ahora)
  const serie = evaluarSerie(await serieDelAnio(s.cuentaId, anio), anio)
  if (!serie.ok) faltan.push(serie.motivo)

  const dec = decidirSalida({
    hoy: fechaMadrid(ahora).iso, hasta: reserva?.hasta ?? null, estadoSolicitud: s.estado,
    factura: fx ? { estado: fx.estado, envioIntentos: fx.envioIntentos } : null, faltan, avisoYa: !!c.aviso,
  })
  // Sin reserva legible no hay fecha de salida, pero la candidata salió de la consulta por fecha: se avisa igual.
  const decFinal: DecisionSalida = !reserva && !c.aviso ? { accion: 'avisar', motivos: faltan } : dec
  if (simular || decFinal.accion === 'nada') return { reservationId: rid, accion: decFinal.accion, detalle: 'porque' in decFinal ? decFinal.porque : simular ? 'simulado' : '' }

  const piso = escapeHtml(reserva?.piso ?? s.propertyId)
  if (decFinal.accion === 'avisar') return avisar(c, rid, piso, reserva?.hasta ?? null, decFinal.motivos, fx && fx.estado === 'borrador' ? fx.id : null)

  let facturaId = fx?.id ?? null
  let numero = fx?.numeroCompleto ?? null
  if (decFinal.accion === 'emitir') {
    if (!v.ok) return { reservationId: rid, accion: 'nada', detalle: 'receptor inválido' }
    const b = await prepararBorrador(s.id, v.receptor, { proponer: false })
    if (!b.ok) {
      if (b.codigo === 'ya_emitida') return { reservationId: rid, accion: 'nada', detalle: 'ya emitida' }
      return avisar(c, rid, piso, reserva?.hasta ?? null, [b.motivo], null)
    }
    facturaId = b.facturaId
    const r = await emitirFactura(facturaId, null, ahora, { automatico: true })
    if (r.estado === 'bloqueada') return avisar(c, rid, piso, reserva?.hasta ?? null, [r.motivo], facturaId)
    // Otro pase (o un ✅) la emitió a la vez: ese manda el correo.
    if (r.estado !== 'emitida') return { reservationId: rid, accion: 'nada', detalle: r.estado }
    numero = r.numeroCompleto
  }
  if (!facturaId) return { reservationId: rid, accion: 'nada', detalle: 'sin factura' }

  const env = await enviarFactura(facturaId)
  const linea = lineaEnvio(numero, env, facturaId)
  const informe = `🤖 <b>Factura del día de salida</b> · ${piso} · reserva ${escapeHtml(rid)}\n${linea.linea}`
  await (linea.botones ? tgAvisoBotones('huespedes.factura-borrador', informe, linea.botones) : tgAviso('huespedes.factura-borrador', informe)).catch(() => null)
  return { reservationId: rid, accion: decFinal.accion, detalle: env.estado }
}

async function avisar(c: Candidata, rid: string, piso: string, hasta: string | null, motivos: string[], borradorId: string | null): Promise<ResultadoPase> {
  const motivo = motivos.join(' · ').slice(0, 500)
  const reclamado = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE sivra_factura_solicitudes SET auto_aviso_at = now(), auto_aviso_motivo = ${motivo}
     WHERE id = ${c.id}::uuid AND auto_aviso_at IS NULL RETURNING id::text`)
  if (!reclamado.length) return { reservationId: rid, accion: 'nada', detalle: 'ya avisado' }
  const base = (process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_FACTURAS).replace(/\/+$/, '')
  const botones: Boton[][] = borradorId ? botonesPropuesta(borradorId) : [[{ texto: '🧾 Abrir facturas', url: `${base}/sivra/facturas` }]]
  const texto = textoAvisoIncompleta({ piso, reservationId: escapeHtml(rid), hasta, motivos: motivos.map(escapeHtml) })
  const msg = await tgAvisoBotones('huespedes.factura-borrador', texto, botones).catch(() => null)
  if (msg === null) {
    // No llegó (o el aviso está silenciado): se suelta para el siguiente pase.
    await prisma.$executeRaw(Prisma.sql`UPDATE sivra_factura_solicitudes SET auto_aviso_at = NULL WHERE id = ${c.id}::uuid`)
    return { reservationId: rid, accion: 'avisar', detalle: 'telegram no entregó: se reintenta mañana' }
  }
  // Con borrador y botones ✅/✏️, el ✅ solo vale si este mensaje es el vigente del borrador.
  if (borradorId) await prisma.sivraFacturaHuesped.updateMany({ where: { id: borradorId, estado: 'borrador' }, data: { telegramMessageId: BigInt(msg) } })
  return { reservationId: rid, accion: 'avisar', detalle: 'avisado' }
}

