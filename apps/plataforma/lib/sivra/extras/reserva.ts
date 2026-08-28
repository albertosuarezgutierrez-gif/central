// lib/sivra/extras/reserva.ts — estado del extra POR RESERVA (ofrecido → pagado → avisado).
//
// 🚨 TRES ESTADOS, NO DOS. `aviso_limpieza_at` a NULL significa «todavía no se ha avisado», jamás
// «no hacía falta avisar». Por eso `marcarAvisoLimpieza` guarda también el ERROR cuando el email
// falla: un extra pagado, la cuna sin montar y nadie enterado es el fallo caro de este repo.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export type EstadoExtra = 'ofrecido' | 'enlace_enviado' | 'pagado' | 'caducado' | 'cancelado' | 'reembolsado'

export interface ExtraReserva {
  id: string
  booking_id: string
  property_id: string
  codigo: string
  precio_cents: number
  estado: EstadoExtra
  stripe_payment_link_id: string | null
  enlace_enviado_at: Date | null
  recordatorio_at: Date | null
  pagado_at: Date | null
  aviso_limpieza_at: Date | null
}

const COLS = Prisma.sql`id::text, booking_id, property_id, codigo, precio_cents::int AS precio_cents,
  estado, stripe_payment_link_id, enlace_enviado_at, recordatorio_at, pagado_at, aviso_limpieza_at`

/**
 * Registra que a esta reserva se le OFRECIÓ el extra a este precio.
 *
 * La llama el botón ✅ de Telegram, y solo él: «lo aprobó Alberto» pasa a ser un hecho de la BD y no
 * una inferencia sobre el hilo. Idempotente — el ✅ puede pulsarse dos veces sobre propuestas duplicadas.
 */
export async function registrarOferta(p: {
  bookingId: string; propertyId: string; codigo: string; precioCents: number
}): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO sivra_extras_reserva (booking_id, property_id, codigo, precio_cents, estado)
    VALUES (${p.bookingId}, ${p.propertyId}, ${p.codigo}, ${p.precioCents}, 'ofrecido')
    ON CONFLICT (booking_id, codigo) DO NOTHING
  `).catch(() => {})
}

/** El extra OFRECIDO y aún sin cobrar de esta reserva, si lo hay. */
export async function ofertaPendiente(bookingId: string): Promise<ExtraReserva | null> {
  try {
    const filas = await prisma.$queryRaw<ExtraReserva[]>(Prisma.sql`
      SELECT ${COLS} FROM sivra_extras_reserva
      WHERE booking_id = ${bookingId} AND estado = 'ofrecido'
      ORDER BY ofrecido_at DESC LIMIT 1
    `)
    return filas[0] ?? null
  } catch { return null }
}

export async function marcarEnlaceEnviado(id: string, paymentLinkId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE sivra_extras_reserva
    SET estado = 'enlace_enviado', stripe_payment_link_id = ${paymentLinkId}, enlace_enviado_at = now()
    WHERE id = ${id}::uuid AND estado = 'ofrecido'
  `).catch(() => {})
}

/**
 * Marca el extra como pagado. IDEMPOTENTE por `payment_intent`: Stripe reintenta los webhooks y el
 * mismo cobro no puede disparar dos avisos a la limpieza.
 *
 * Devuelve la fila SOLO si esta llamada fue la que la marcó (es decir, la primera). Un `null` significa
 * «ya estaba pagada o no existe», y aguas arriba se traduce en «no vuelvas a avisar».
 */
export async function marcarPagado(p: { paymentLinkId?: string; bookingId?: string; codigo?: string; paymentIntentId: string }): Promise<ExtraReserva | null> {
  try {
    const filtro = p.paymentLinkId
      ? Prisma.sql`stripe_payment_link_id = ${p.paymentLinkId}`
      : Prisma.sql`booking_id = ${p.bookingId ?? ''} AND codigo = ${p.codigo ?? ''}`
    const filas = await prisma.$queryRaw<ExtraReserva[]>(Prisma.sql`
      UPDATE sivra_extras_reserva
      SET estado = 'pagado', pagado_at = now(), stripe_payment_intent_id = ${p.paymentIntentId}
      WHERE ${filtro} AND estado <> 'pagado'
      RETURNING ${COLS}
    `)
    return filas[0] ?? null
  } catch { return null }
}

/** Guarda el desenlace del aviso a la limpieza: la hora si salió, el motivo si no. */
export async function marcarAvisoLimpieza(id: string, r: { ok: boolean; error?: string }): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE sivra_extras_reserva
    SET aviso_limpieza_at = ${r.ok ? new Date() : null},
        aviso_limpieza_error = ${r.ok ? null : (r.error || 'desconocido').slice(0, 500)}
    WHERE id = ${id}::uuid
  `).catch(() => {})
}

/** Extras pagados de un piso y año — la cifra que «suma en contabilidad». */
export async function totalExtrasPagados(anio: number, propertyId?: string | null): Promise<number> {
  try {
    const filtro = propertyId ? Prisma.sql`AND property_id = ${propertyId}` : Prisma.empty
    const filas = await prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(precio_cents), 0)::float / 100 AS total
      FROM sivra_extras_reserva
      WHERE estado = 'pagado' AND EXTRACT(YEAR FROM pagado_at) = ${anio} ${filtro}
    `)
    return filas[0]?.total ?? 0
  } catch { return 0 }
}

/** Enlaces enviados y sin pagar, para el cron de impago. */
export async function pendientesDeCobro(): Promise<ExtraReserva[]> {
  try {
    return await prisma.$queryRaw<ExtraReserva[]>(Prisma.sql`
      SELECT ${COLS} FROM sivra_extras_reserva
      WHERE estado = 'enlace_enviado' ORDER BY enlace_enviado_at ASC LIMIT 50
    `)
  } catch { return [] }
}

export async function marcarRecordatorio(id: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE sivra_extras_reserva SET recordatorio_at = now() WHERE id = ${id}::uuid
  `).catch(() => {})
}

export async function marcarCaducado(id: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE sivra_extras_reserva SET estado = 'caducado', caducado_at = now() WHERE id = ${id}::uuid
  `).catch(() => {})
}
