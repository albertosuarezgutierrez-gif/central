// lib/sivra/facturas/servicio.ts — solicitudes y borradores de factura al huésped (SERVIDOR: BD + Telegram).
//
// Multi-tenant: la cuenta de una factura es la DUEÑA del negocio cuyo `ref_ext` es el piso (`negocios.ref_ext =
// incomes.propertyId`). Si el piso no está enlazado a exactamente una cuenta, NO se crea nada (fail-closed): una
// factura sin dueño claro es peor que ninguna. Toda lectura desde pantalla filtra por `cuenta_id` de la sesión.
//
// La numeración NO vive aquí: un borrador nunca lleva número (ver `emitir.ts`).

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { escapeHtml, tgSendDocument } from '@central/core-telegram'
import { tgAviso, tgAvisoBotones } from '@/lib/telegram/avisos'
import { EMISOR_FACTURAS_HUESPED } from './emisor'
import { desglosarDesdeTotal } from './importes'
import { evaluarSerie, fechaMadrid, type SerieConfig } from './numeracion'
import { generarPdfFactura } from './pdf'
import { type Receptor } from './receptor'
import { botonesPropuesta, textoPropuesta } from './telegram'
import { generarToken, urlFormulario } from './enlace'

export type Reserva = {
  reservationId: string
  propertyId: string
  piso: string
  /** `incomes.amount_gross` (IVA incluido). `null` = 0 o ausente en la fuente: NO se sabe el importe. */
  total: number | null
  desde: string | null
  hasta: string | null
}

export async function leerReserva(reservationId: string): Promise<Reserva | null> {
  const filas = await prisma.$queryRaw<Array<{ rid: string; pid: string; piso: string; gross: number | null; ci: Date | null; co: Date | null }>>(Prisma.sql`
    SELECT i."reservationId" AS rid, i."propertyId" AS pid, p.name AS piso, i.amount_gross::float8 AS gross, i."checkIn" AS ci, i."checkOut" AS co
      FROM incomes i JOIN properties p ON p.id = i."propertyId"
     WHERE i."reservationId" = ${reservationId}
     LIMIT 2`)
  if (filas.length !== 1) return null // 0 = no existe; 2 = ambigua → no se factura a ciegas
  const r = filas[0]
  return {
    reservationId: r.rid,
    propertyId: r.pid,
    piso: r.piso,
    // Un 0 en amount_gross no es «gratis»: es que la fuente no lo trae (CLAUDE.md, tres estados).
    total: typeof r.gross === 'number' && r.gross > 0 ? r.gross : null,
    desde: r.ci ? r.ci.toISOString().slice(0, 10) : null,
    hasta: r.co ? r.co.toISOString().slice(0, 10) : null,
  }
}

/** Cuenta dueña del piso. `null` si no hay exactamente una (no se adivina). */
export async function cuentaDePiso(propertyId: string): Promise<string | null> {
  const filas = await prisma.$queryRaw<Array<{ cuenta_id: string }>>(Prisma.sql`
    SELECT DISTINCT s.cuenta_id::text AS cuenta_id FROM negocios n JOIN sociedades s ON s.id = n.sociedad_id WHERE n.ref_ext = ${propertyId}`)
  return filas.length === 1 ? filas[0].cuenta_id : null
}

export type ResultadoSolicitud =
  | { ok: true; solicitudId: string; token: string; url: string; nueva: boolean }
  | { ok: false; motivo: string }

/**
 * Crea (o reutiliza) la solicitud viva de una reserva. Una por reserva: el agente y el alta manual comparten enlace.
 * `cuentaEsperada` (alta manual): la reserva debe ser de ESA cuenta; si no, no se crea.
 */
export async function asegurarSolicitud(reservationId: string, origen: 'agente' | 'manual', cuentaEsperada?: string): Promise<ResultadoSolicitud> {
  const reserva = await leerReserva(reservationId)
  if (!reserva) return { ok: false, motivo: 'reserva no encontrada en incomes' }
  const cuentaId = await cuentaDePiso(reserva.propertyId)
  if (!cuentaId) return { ok: false, motivo: `el piso ${reserva.propertyId} no está enlazado a una sola cuenta` }
  if (cuentaEsperada && cuentaEsperada !== cuentaId) return { ok: false, motivo: 'reserva no encontrada' }

  const viva = await prisma.sivraFacturaSolicitud.findFirst({ where: { reservationId, estado: { not: 'cancelada' } } })
  if (viva) {
    // El enlace sigue sirviendo mientras haga falta: se alarga la caducidad, no se cambia el token.
    const minimo = new Date(Date.now() + 90 * 86400_000)
    if (viva.expiraAt < minimo) await prisma.sivraFacturaSolicitud.update({ where: { id: viva.id }, data: { expiraAt: minimo, updatedAt: new Date() } })
    return { ok: true, solicitudId: viva.id, token: viva.token, url: urlFormulario(viva.token), nueva: false }
  }
  const token = generarToken()
  try {
    const s = await prisma.sivraFacturaSolicitud.create({
      data: { cuentaId, token, reservationId, propertyId: reserva.propertyId, origen },
    })
    return { ok: true, solicitudId: s.id, token, url: urlFormulario(token), nueva: true }
  } catch (e) {
    // Carrera (agente y alta manual a la vez): el índice único parcial deja una; se devuelve esa.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const otra = await prisma.sivraFacturaSolicitud.findFirst({ where: { reservationId, estado: { not: 'cancelada' } } })
      if (otra) return { ok: true, solicitudId: otra.id, token: otra.token, url: urlFormulario(otra.token), nueva: false }
    }
    throw e
  }
}

export type VistaPublica =
  | { estado: 'ok'; piso: string; desde: string | null; hasta: string | null; completada: boolean; emitida: boolean }
  | { estado: 'no_valida' }
  | { estado: 'caducada' }

/** Lo ÚNICO que ve el huésped: piso y fechas. Ni importes, ni nombre, ni sus datos ya enviados (el enlace se reenvía). */
export async function vistaPublica(token: string): Promise<VistaPublica> {
  const s = await prisma.sivraFacturaSolicitud.findUnique({ where: { token } })
  if (!s || s.estado === 'cancelada') return { estado: 'no_valida' }
  if (s.expiraAt < new Date()) return { estado: 'caducada' }
  const reserva = await leerReserva(s.reservationId)
  if (!reserva) return { estado: 'no_valida' }
  const f = await prisma.sivraFacturaHuesped.findFirst({ where: { reservationId: s.reservationId, tipo: 'ordinaria', estado: { not: 'rectificada' } }, select: { estado: true } })
  return { estado: 'ok', piso: reserva.piso, desde: reserva.desde, hasta: reserva.hasta, completada: s.estado === 'completada', emitida: !!f && f.estado !== 'borrador' }
}

export type ResultadoBorrador =
  | { ok: true; facturaId: string; propuesta: 'enviada' | 'silenciada' | 'fallida' }
  | { ok: false; motivo: string; codigo: 'no_valida' | 'caducada' | 'ya_emitida' | 'sin_importe' | 'sin_reserva' }

/** Guarda los datos fiscales (ya validados con `validarReceptor`) y prepara el borrador + aviso a Alberto. */
export async function completarSolicitud(
  sel: { token: string } | { solicitudId: string; cuentaId: string },
  receptor: Receptor,
  opts: { totalManual?: number | null } = {},
): Promise<ResultadoBorrador> {
  const s = 'token' in sel
    ? await prisma.sivraFacturaSolicitud.findUnique({ where: { token: sel.token } })
    : await prisma.sivraFacturaSolicitud.findFirst({ where: { id: sel.solicitudId, cuentaId: sel.cuentaId } })
  if (!s || s.estado === 'cancelada') return { ok: false, motivo: 'enlace no válido', codigo: 'no_valida' }
  if ('token' in sel && s.expiraAt < new Date()) return { ok: false, motivo: 'enlace caducado', codigo: 'caducada' }
  const yaEmitida = await prisma.sivraFacturaHuesped.findFirst({ where: { reservationId: s.reservationId, tipo: 'ordinaria', estado: { notIn: ['borrador', 'rectificada'] } }, select: { id: true } })
  if (yaEmitida) return { ok: false, motivo: 'la factura de esta reserva ya está emitida', codigo: 'ya_emitida' }

  await prisma.sivraFacturaSolicitud.update({
    where: { id: s.id },
    data: {
      estado: 'completada', completadaAt: new Date(), updatedAt: new Date(),
      receptorTipo: receptor.tipo, receptorNombre: receptor.nombre, receptorNif: receptor.nif,
      receptorPais: receptor.pais, receptorEmail: receptor.email, receptorDireccion: receptor.direccion as unknown as Prisma.InputJsonValue,
    },
  })
  return prepararBorrador(s.id, receptor, opts)
}

function noches(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta) return null
  const n = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400_000)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function conceptoEstancia(piso: string, desde: string | null, hasta: string | null, reservationId: string): string {
  const n = noches(desde, hasta)
  return `Servicio de alojamiento turístico en «${piso}»${n ? ` (${n} ${n === 1 ? 'noche' : 'noches'})` : ''} · reserva ${reservationId}`
}

/** Serie activa del año (o `null`). Solo lectura: emitir la vuelve a leer con FOR UPDATE. */
export async function serieDelAnio(cuentaId: string, anio: number): Promise<SerieConfig | null> {
  const s = await prisma.sivraFacturaSerie.findFirst({ where: { cuentaId, anio, activa: true } })
  if (!s) return null
  return { id: s.id, prefijo: s.prefijo, anio: s.anio, siguienteNumero: s.siguienteNumero, tipoIva: s.tipoIva === null ? null : Number(s.tipoIva), mencionIva: s.mencionIva, activa: s.activa }
}

async function prepararBorrador(solicitudId: string, receptor: Receptor, opts: { totalManual?: number | null }): Promise<ResultadoBorrador> {
  const s = await prisma.sivraFacturaSolicitud.findUniqueOrThrow({ where: { id: solicitudId } })
  const reserva = await leerReserva(s.reservationId)
  if (!reserva) return { ok: false, motivo: 'reserva no encontrada', codigo: 'sin_reserva' }
  const total = opts.totalManual && opts.totalManual > 0 ? Math.round(opts.totalManual * 100) / 100 : reserva.total
  if (total === null) {
    // Sin importe no hay borrador (y el ✅ no podría emitir nada). Se avisa a Alberto para que lo ponga a mano.
    await tgAviso('huespedes.factura-borrador',
      `🧾 Factura de huésped: ${escapeHtml(reserva.piso)} · reserva ${escapeHtml(reserva.reservationId)}\n⛔ <b>No sé el importe</b> (amount_gross vacío o 0 en incomes). Ponlo a mano en /sivra/facturas.`)
    return { ok: false, motivo: 'importe de la reserva desconocido', codigo: 'sin_importe' }
  }
  const concepto = conceptoEstancia(reserva.piso, reserva.desde, reserva.hasta, reserva.reservationId)
  const datos = {
    cuentaId: s.cuentaId, solicitudId: s.id, reservationId: s.reservationId, propertyId: s.propertyId,
    concepto, emisor: { ...EMISOR_FACTURAS_HUESPED } as Prisma.InputJsonValue, receptor: receptor as unknown as Prisma.InputJsonValue,
    total: new Prisma.Decimal(total.toFixed(2)),
    fechaOperacionDesde: reserva.desde ? new Date(`${reserva.desde}T00:00:00Z`) : null,
    fechaOperacionHasta: reserva.hasta ? new Date(`${reserva.hasta}T00:00:00Z`) : null,
  }
  const existente = await prisma.sivraFacturaHuesped.findFirst({ where: { reservationId: s.reservationId, tipo: 'ordinaria', estado: { not: 'rectificada' } } })
  let facturaId: string
  if (existente) {
    if (existente.estado !== 'borrador') return { ok: false, motivo: 'la factura de esta reserva ya está emitida', codigo: 'ya_emitida' }
    // Solo se pisa si SIGUE siendo borrador (una emisión concurrente gana).
    const n = await prisma.sivraFacturaHuesped.updateMany({ where: { id: existente.id, estado: 'borrador' }, data: { ...datos, updatedAt: new Date() } })
    if (n.count !== 1) return { ok: false, motivo: 'la factura de esta reserva ya está emitida', codigo: 'ya_emitida' }
    facturaId = existente.id
  } else {
    facturaId = (await prisma.sivraFacturaHuesped.create({ data: datos })).id
  }
  const propuesta = await proponerEnTelegram(facturaId)
  return { ok: true, facturaId, propuesta }
}

/** Borrador → aviso a Alberto con resumen, PDF de revisión y botones ✅/✏️. */
export async function proponerEnTelegram(facturaId: string): Promise<'enviada' | 'silenciada' | 'fallida'> {
  const f = await prisma.sivraFacturaHuesped.findUnique({ where: { id: facturaId } })
  if (!f || f.estado !== 'borrador') return 'fallida'
  const reserva = await leerReserva(f.reservationId)
  const receptor = f.receptor as unknown as Receptor
  const total = Number(f.total)
  const { anio } = fechaMadrid(new Date())
  const est = evaluarSerie(await serieDelAnio(f.cuentaId, anio), anio)
  const imp = est.ok ? desglosarDesdeTotal(total, est.serie.tipoIva) : null
  const desde = f.fechaOperacionDesde?.toISOString().slice(0, 10) ?? null
  const hasta = f.fechaOperacionHasta?.toISOString().slice(0, 10) ?? null
  const texto = textoPropuesta({
    piso: reserva?.piso ?? f.propertyId, reservationId: f.reservationId, estanciaDesde: desde, estanciaHasta: hasta,
    receptor, total, base: imp?.base ?? null, cuota: imp?.cuota ?? null, tipoIva: imp?.tipoIva ?? null,
    bloqueo: est.ok ? null : est.motivo,
  })
  const msgId = await tgAvisoBotones('huespedes.factura-borrador', texto, botonesPropuesta(f.id))
  if (msgId === null) return 'silenciada'
  await prisma.sivraFacturaHuesped.updateMany({ where: { id: f.id, estado: 'borrador' }, data: { telegramMessageId: BigInt(msgId) } })
  try {
    const pdf = await generarPdfFactura({
      numeroCompleto: null, fechaExpedicion: null, emisor: EMISOR_FACTURAS_HUESPED, receptor, concepto: f.concepto,
      estanciaDesde: desde, estanciaHasta: hasta, total, base: imp?.base ?? null, tipoIva: imp?.tipoIva ?? null, cuota: imp?.cuota ?? null,
      mencionIva: est.ok && est.serie.tipoIva === 0 ? est.serie.mencionIva : null,
    }, { borrador: true })
    await tgSendDocument({ data: pdf, nombre: `borrador-factura-${f.reservationId}.pdf` }, 'Borrador (sin número, sin validez fiscal)', { responderA: msgId })
  } catch (e) {
    console.error('[facturas-huesped] PDF de borrador:', e instanceof Error ? e.message : e)
  }
  return 'enviada'
}
