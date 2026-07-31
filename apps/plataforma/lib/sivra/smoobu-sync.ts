// lib/sivra/smoobu-sync.ts — sync incremental de reservas de Smoobu → tabla `incomes`.
// Extraído de app/api/sivra/updates/sync para poder reusarlo desde el webhook (tiempo real)
// y desde el cron (red de seguridad). Es IDEMPOTENTE: upsert por reservationId, borra en cancelación.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSmoobuKey } from '@/lib/smoobu'
import { PORTAL_MAP } from '@/lib/portales'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'

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

/** De dónde viene la pasada: el cron diario (red de seguridad) o el webhook de Smoobu (tiempo real). */
export type OrigenSync = 'cron' | 'webhook' | 'manual'

/**
 * 💓 Deja la huella de la pasada en `agente_latidos`, corra bien o mal.
 *
 * 🚨 Es lo ÚNICO que distingue «no ha entrado ninguna reserva nueva» de «no se
 * ha podido hablar con Smoobu». Sin ella, la salud del sync se medía por
 * `MAX(incomes."createdAt")` — o sea, por si había reservas nuevas — y eso daba
 * las dos mentiras a la vez: 🔴 falso en cuanto pasaban 2 días tranquilos (que
 * es lo normal: ~0,7 reservas nuevas al día), y 🟢 falso en cuanto entraba UNA
 * reserva suelta aunque el sync llevara semanas muerto. Ver `lib/sivra/estado-sync.ts`.
 *
 * Best-effort por diseño (`registrarLatido` se traga sus errores): la huella
 * nunca debe tumbar el sync. Si la escritura falla no se finge nada — se queda
 * sin huella, y el vigía lo lee como «sin señal», que es lo honesto.
 */
async function anotarPasada(origen: OrigenSync, ok: boolean, datos: Record<string, unknown>) {
  await registrarLatido('smoobu_sync', ok, JSON.stringify({ origen, ...datos }))
}

export async function runSync(
  days: number,
  maxPages = 20,
  arrFrom?: string,
  arrTo?: string,
  origen: OrigenSync = 'cron',
) {
  try {
    return await ejecutarSync(days, maxPages, arrFrom, arrTo, origen)
  } catch (e) {
    // Un fallo tiene que quedar ANOTADO, no solo propagado: el 500 se pierde en
    // los logs de Vercel, la huella no. Se re-lanza para que el llamante siga
    // enterándose igual que antes.
    await anotarPasada(origen, false, { error: String((e as Error)?.message ?? e).slice(0, 200) })
    throw e
  }
}

async function ejecutarSync(
  days: number,
  maxPages: number,
  arrFrom: string | undefined,
  arrTo: string | undefined,
  origen: OrigenSync,
) {
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

  const cnt = { new: 0, modified: 0, cancelled: 0, skipped: 0 }
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

    if (ex.length === 0) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO incomes ("propertyId", date, amount, portal, "reservationId", "guestName", "checkIn", "checkOut", nights)
        VALUES (${pid}, ${ci.toISOString()}::timestamptz, ${amt}, ${portal}::"Portal",
                ${rid}, ${b['guest-name'] || null}, ${ci.toISOString()}::timestamptz,
                ${co?.toISOString() || null}::timestamptz, ${nights(ci, co)})
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
            portal=${portal}::"Portal"
          WHERE "reservationId" = ${rid}
        `)
        cnt.modified++
      } else cnt.skipped++
    }
  }

  // `vistas` (reservas que Smoobu devolvió en la ventana) va aparte de `nuevas`:
  // un 0 en `nuevas` es «no hay reservas nuevas», un 0 en `vistas` es «Smoobu no
  // me ha dado NADA», que huele a clave con permisos recortados.
  await anotarPasada(origen, true, {
    dias: days, vistas: all.length, nuevas: cnt.new, modificadas: cnt.modified, canceladas: cnt.cancelled,
  })

  return {
    success: true,
    message: `${cnt.new} nuevas, ${cnt.modified} modificadas, ${cnt.cancelled} canceladas`,
    ...cnt, total: all.length, since: from,
  }
}
