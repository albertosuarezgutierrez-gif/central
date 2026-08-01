// lib/sivra/smoobu-sync.ts — sync incremental de reservas de Smoobu → tabla `incomes`.
// Extraído de app/api/sivra/updates/sync para poder reusarlo desde el webhook (tiempo real)
// y desde el cron (red de seguridad). Es IDEMPOTENTE: upsert por reservationId, borra en cancelación.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSmoobuKey } from '@/lib/smoobu'
import { PORTAL_MAP } from '@/lib/portales'

const BOOKING_NET_FACTOR = 0.8028

function parseDate(s?: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function nights(ci: Date | null, co: Date | null): number {
  return ci && co ? Math.round((co.getTime() - ci.getTime()) / 86400000) : 0
}

async function fetchPage(p: number, from: string, apiKey: string, arrFrom?: string, arrTo?: string) {
  // showCancellation=1 es OBLIGATORIO: sin este flag Smoobu OCULTA las reservas canceladas del
  // listado, así que la rama `isCancel` de runSync nunca las veía y el DELETE nunca se ejecutaba
  // → cada cancelación dejaba un registro fantasma en `incomes` (calendario/ingresos inflados).
  const q = new URLSearchParams({ pageSize: '100', page: String(p), modifiedFrom: from, showCancellation: '1' })
  if (arrFrom) q.set('from', arrFrom)
  if (arrTo) q.set('to', arrTo)
  const res = await fetch(`https://login.smoobu.com/api/reservations?${q}`, {
    headers: { 'Api-Key': apiKey }, cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Smoobu ${res.status}`)
  const d = await res.json()
  return { bookings: d.bookings || [], pageCount: d.page_count || 1 }
}

export async function runSync(days: number, maxPages = 20, arrFrom?: string, arrTo?: string) {
  const API_KEY = await getSmoobuKey()
  if (!API_KEY) throw new Error('SMOOBU_API_KEY no configurada')

  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  let page = 1, total = 1
  const all: any[] = []

  do {
    const { bookings, pageCount } = await fetchPage(page, from, API_KEY, arrFrom, arrTo)
    all.push(...bookings)
    total = pageCount
    page++
  } while (page <= total && page <= maxPages)

  // Cargar propiedades (tabla Prisma `properties`)
  const props = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT id, name FROM properties
  `)
  const byName = new Map(props.map(p => [p.name.toLowerCase().trim(), p.id]))

  const cnt = { new: 0, modified: 0, cancelled: 0, skipped: 0, reservedAt: 0 }
  const logs: any[] = []

  for (const b of all) {
    if (b['is-blocked-booking']) { cnt.skipped++; continue }
    const rid = String(b.id)
    const ci = parseDate(b.arrival)
    const co = parseDate(b.departure)
    const amtGross = typeof b.price === 'string' ? parseFloat(b.price) : (b.price || 0)
    const portal_tmp = PORTAL_MAP[b.channel?.name || ''] || 'OTRO'
    const amt = portal_tmp === 'BOOKING' ? Math.round(amtGross * BOOKING_NET_FACTOR * 100) / 100 : amtGross
    const portal = portal_tmp
    const isCancel = b.type === 'cancellation'

    let pid: string | null = null
    if (b.apartment?.name) {
      const k = b.apartment.name.toLowerCase().trim()
      pid = byName.get(k) || null
      if (!pid) for (const [n, i] of byName) if (n.includes(k) || k.includes(n)) { pid = i; break }
    }

    const ex = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, "propertyId", "guestName", portal, amount, "checkIn", "checkOut"
      FROM incomes WHERE "reservationId" = ${rid} LIMIT 1
    `)

    if (isCancel) {
      if (ex.length > 0) {
        await prisma.$executeRaw(Prisma.sql`DELETE FROM incomes WHERE "reservationId" = ${rid}`)
        logs.push({ reservationId: rid, type: 'cancelled' })
        cnt.cancelled++
      } else cnt.skipped++
      continue
    }

    if (!ci || !pid) { cnt.skipped++; continue }

    // Fecha REAL en que se hizo la reserva. Smoobu la publica como `created-at` (kebab-case, como
    // `guest-name` o `is-blocked-booking`) y la trae también para el histórico. Es el dato que
    // permite medir la antelación de verdad: `incomes.createdAt` es, en casi todo el histórico, la
    // fecha de la importación masiva. Ver `prisma/sql/2026-08-01_incomes_reserved_at.sql`.
    const reservedAt = parseDate(b['created-at'])?.toISOString() ?? null

    if (ex.length === 0) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO incomes ("propertyId", date, amount, portal, "reservationId", "guestName", "checkIn", "checkOut", nights, reserved_at)
        VALUES (${pid}, ${ci.toISOString()}::timestamptz, ${amt}, ${portal}::"Portal",
                ${rid}, ${b['guest-name'] || null}, ${ci.toISOString()}::timestamptz,
                ${co?.toISOString() || null}::timestamptz, ${nights(ci, co)},
                ${reservedAt}::timestamptz)
      `)
      cnt.new++
    } else {
      const row = ex[0]
      const changed = Math.abs(row.amount - amt) > 0.01 ||
        row.checkIn?.toISOString().slice(0, 10) !== ci?.toISOString().slice(0, 10)
      if (changed) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE incomes SET amount=${amt}, "checkIn"=${ci.toISOString()}::timestamptz,
            "checkOut"=${co?.toISOString() || null}::timestamptz, nights=${nights(ci, co)},
            portal=${portal}::"Portal",
            reserved_at = COALESCE(${reservedAt}::timestamptz, reserved_at)
          WHERE "reservationId" = ${rid}
        `)
        cnt.modified++
      } else if (reservedAt) {
        // La fila no cambió de importe ni de fechas, pero puede que le falte `reserved_at` (todas
        // las anteriores al 01/08/2026 lo tienen NULL). Rellenarlo aquí hace que el sync diario
        // vaya completando el histórico solo, sin depender de que el backfill llegue a todo.
        const rellenadas = await prisma.$executeRaw(Prisma.sql`
          UPDATE incomes SET reserved_at = ${reservedAt}::timestamptz
          WHERE "reservationId" = ${rid} AND reserved_at IS NULL`)
        if (rellenadas > 0) cnt.reservedAt++
        cnt.skipped++
      } else cnt.skipped++
    }
  }

  return {
    success: true,
    message: `${cnt.new} nuevas, ${cnt.modified} modificadas, ${cnt.cancelled} canceladas` +
      (cnt.reservedAt ? `, ${cnt.reservedAt} con fecha de reserva rellenada` : ''),
    ...cnt, total: all.length, since: from,
  }
}
