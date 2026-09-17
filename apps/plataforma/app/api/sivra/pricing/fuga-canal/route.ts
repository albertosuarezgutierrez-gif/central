import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"
import { tgAviso } from "@/lib/telegram"
import { eur } from "@/lib/dinero"
import { fugaCanal, type FugaCanal, type ReservaCobrada } from "@/lib/sivra/pricing-fuga-canal"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/pricing/fuga-canal   (cron diario 09:20 UTC · o sesión de admin)
//
// Mide, por piso, lo que el huésped PAGÓ de verdad por dormir (`incomes.amount_gross` menos la
// limpieza, que Booking mete en el bruto) contra la LISTA PÚBLICA que el motor creía vender cuando
// entró la reserva (base de `pricing_applied` × `channel_markup`). Es la capa que ningún otro
// centinela mira: `pricing/canal` calibra escaparate↔base y el centinela del huésped compara
// escaparate↔mercado; los dos se quedan en el precio listado. La capa se midió en el extranet
// (Genius 15 % × móvil 10 % = 0,765 de la lista pública en 10 de 12 reservas de House) y esa
// misma tarde se desmontó: hoy la pila aceptada es Genius 10 % × country rate 10 % = 0,81, y el
// umbral (`UMBRAL_FUGA`) va justo debajo. Ver la cabecera de `lib/sivra/pricing-fuga-canal.ts`.
//
// Solo Booking: el canal calibrado (`channel_markup` + `cuota_fija`) describe ESE portal.
// Un piso sin reservas en la ventana NO es «sin fuga»: es «sin dato», y así se dice.
const VENTANA_DIAS = 90
/**
 * Solo se juzgan reservas hechas desde que el extranet quedó como está (07/09/2026: fuera Basic
 * Deal, móvil y Genius 15 %). Las anteriores ya están medidas (5.717€ bajo lista en House) y con
 * el markup de hoy (1,20) saldrían a 0,67: contarlas sería disparar la alarma 90 días seguidos por
 * algo que ya se decidió. Ventana efectiva = max(DESDE, hoy − 90 días).
 */
const DESDE = "2026-09-07"
const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center: "Duplex Center",
  prop_luxury_busto: "Luxury Busto",
  prop_busto_reform: "Busto Reform",
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const secretOk = !!secret && bearer === secret
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const settings = await prisma.$queryRaw<{
    property_id: string; channel_markup: number; cuota_fija: number; noches_ref: number
  }[]>(Prisma.sql`
    SELECT property_id, channel_markup::float8 AS channel_markup,
           COALESCE(cuota_fija, 0)::float8 AS cuota_fija, COALESCE(noches_ref, 2)::int AS noches_ref
    FROM pricing_settings WHERE enabled = true ORDER BY property_id`)

  // Base MEDIA del motor en las noches de la reserva, tomada de la última escritura real ANTERIOR a
  // `reserved_at`: lo que Smoobu tenía puesto cuando el huésped compró. Sin escritura → NULL → la
  // reserva se cuenta aparte (`nSinBase`), no se juzga.
  const filas = await prisma.$queryRaw<{
    property_id: string; reservation_id: string; check_in: string; nights: number
    bruto: number; base_media: number | null
  }[]>(Prisma.sql`
    WITH r AS (
      SELECT i."propertyId" AS property_id, i."reservationId" AS reservation_id,
             i."checkIn"::date AS check_in, i.nights, i.amount_gross AS bruto, i.reserved_at
      FROM incomes i
      WHERE i.portal::text = 'BOOKING' AND i.amount_gross > 0
        AND i.nights BETWEEN 1 AND 14
        AND i.reserved_at >= GREATEST(now() - (${VENTANA_DIAS} || ' days')::interval, ${DESDE}::date)
        AND i."propertyId" LIKE 'prop_%'
    ),
    noches AS (
      SELECT r.property_id, r.reservation_id, r.reserved_at, g.d::date AS d
      FROM r, generate_series(r.check_in, r.check_in + (r.nights - 1), '1 day') AS g(d)
    ),
    base AS (
      SELECT n.property_id, n.reservation_id,
        (SELECT pa.new_price FROM pricing_applied pa
          WHERE pa.property_id = n.property_id AND pa.rate_date = n.d AND pa.dry_run = false
            AND pa.applied_at <= n.reserved_at
          ORDER BY pa.applied_at DESC LIMIT 1) AS base
      FROM noches n
    )
    SELECT r.property_id, r.reservation_id, r.check_in::text AS check_in, r.nights::int AS nights,
           r.bruto::float8 AS bruto,
           (SELECT AVG(b.base)::float8 FROM base b
             WHERE b.reservation_id = r.reservation_id AND b.property_id = r.property_id) AS base_media
    FROM r ORDER BY r.property_id, r.reserved_at DESC`)

  const porPiso: Record<string, FugaCanal> = {}
  for (const s of settings) {
    const reservas: ReservaCobrada[] = filas
      .filter(f => f.property_id === s.property_id)
      .map(f => ({
        reservationId: f.reservation_id, checkIn: f.check_in, nights: Number(f.nights),
        brutoTotal: Number(f.bruto), baseMedia: f.base_media == null ? null : Number(f.base_media),
      }))
    porPiso[s.property_id] = fugaCanal(reservas, {
      markup: Number(s.channel_markup), cuotaFija: Number(s.cuota_fija), nochesRef: Number(s.noches_ref),
    })
  }

  const conFuga = Object.entries(porPiso).filter(([, f]) => f.estado === "fuga")
  const sinDato = Object.entries(porPiso).filter(([, f]) => f.estado === "sin_reservas" || f.estado === "muestra_corta")
  const resumen = Object.entries(porPiso)
    .map(([p, f]) => `${PROP_NAMES[p] ?? p}: ${f.estado}${f.ratio != null ? ` ${f.ratio}` : ""} (n=${f.n})`)
    .join(" · ")

  if (conFuga.length > 0) {
    const bloques = conFuga.map(([p, f]) => {
      const peores = f.peores
        .map(x => `    · ${x.checkIn ?? x.reservationId} ${x.nights}n: cobrado ${eur(x.cobradoNoche)}/noche por dormir, lista pública ${eur(x.listaNoche)} (×${x.ratio.toFixed(2)})`)
        .join("\n")
      return `*${PROP_NAMES[p] ?? p}* — el huésped paga el *${Math.round((f.ratio ?? 0) * 100)}%* de la lista pública ` +
        `(alojamiento, limpieza aparte) en ${f.n} reservas de Booking de ${VENTANA_DIAS} días` +
        (f.nSinBase ? ` (+${f.nSinBase} sin base del motor, no juzgadas)` : "") +
        (f.nBrutoRaro ? ` (+${f.nBrutoRaro} con bruto raro)` : "") +
        `\n  ${eur(f.eurosBajoLista ?? 0)} de alojamiento por debajo de la lista en el periodo\n${peores}`
    })
    const nota = sinDato.length
      ? `\n\n⚪ Sin dato suficiente: ${sinDato.map(([p, f]) => `${PROP_NAMES[p] ?? p} (${f.estado}, n=${f.n})`).join(", ")}`
      : ""
    try {
      await tgAviso('pisos.pricing-fuga-canal',
        `🟡 *Fuga de canal en Booking*\n\nEl motor lista al p60 del mercado y el huésped compra por debajo: ` +
        `la diferencia vive en el extranet de Booking (Genius, tarifa móvil, ofertas apiladas), no en el motor.\n\n` +
        bloques.join("\n\n") + nota +
        `\n\n_Umbral ${porPiso[conFuga[0][0]].umbral} sobre la lista pública (base × markup = Standard Rate). Aceptado: Genius 10 % × country rate 10 % = 0,81; por debajo hay un descuento que nadie ha pedido. Reservas desde el ${DESDE}._`)
    } catch { /* el aviso no puede tumbar la medición */ }
  }

  await registrarLatido("sivra_fuga_canal", true, `${conFuga.length} piso(s) con fuga · ${resumen}`.slice(0, 300))
  return NextResponse.json({ ok: true, ventana_dias: VENTANA_DIAS, con_fuga: conFuga.map(([p]) => p), por_piso: porPiso })
}
