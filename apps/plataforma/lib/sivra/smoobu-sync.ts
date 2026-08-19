// lib/sivra/smoobu-sync.ts — sync incremental de reservas de Smoobu → tabla `incomes`.
// Extraído de app/api/sivra/updates/sync para poder reusarlo desde el webhook (tiempo real)
// y desde el cron (red de seguridad). Es IDEMPOTENTE: upsert por reservationId, borra en cancelación.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSmoobuKey } from '@/lib/smoobu'
import { PORTAL_MAP } from '@/lib/portales'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { filaCancelacion } from '@/lib/sivra/cancelaciones'

// 🚨 AQUÍ NO SE DESCUENTA COMISIÓN. Lo hace la BD (01/08/2026).
//
// La tabla `incomes` tiene un trigger BEFORE INSERT/UPDATE —`incomes_compute_net`, función
// `compute_income_net()`— que hace DOS cosas: copia a `amount_gross` el valor que llegue en
// `amount` y luego calcula `amount = amount_gross × (1 − commission_pct/100)` leyendo la tasa de
// la tabla `portal_rates`. Para BOOKING esa tasa es **19,72%**, y es CORRECTA: 15% de comisión +
// 1,3% de servicio de pagos, todo con el 21% de IVA encima (verificado contra la factura de marzo
// de 2026, según la propia descripción de la fila).
//
// Lo que estaba mal era que este sync aplicaba ESE MISMO 0,8028 antes de escribir, así que el
// descuento se aplicaba dos veces: Smoobu daba 244,86€ → la app escribía 196,57€ → el trigger
// tomaba eso por el bruto y dejaba `amount` en 157,81€. Un 20% de ingreso desaparecido en cada
// reserva de Booking, y con `amount_gross` guardando un neto disfrazado de bruto.
//
// Contrastado con el desglose real de la extranet (Luxury, 6-8 nov 2026): precio total 244,86€,
// comisión 36,73€ + 3,18€ de servicio de pagos, +21% de IVA = 48,29€ → neto 196,57€. Es
// exactamente `amount_gross`, que confirma la tasa y confirma el doble conteo.
//
// Escribiendo el precio de Smoobu TAL CUAL, el trigger deja `amount_gross` = 244,86 (bruto de
// verdad, como dice su nombre) y `amount` = 196,57 (neto de verdad). Si algún día cambia la
// comisión, se toca `portal_rates` — nunca esto.

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
  // Latido de INTENTO antes de tocar Smoobu (patrón agente_latidos, landmine 31/07/2026):
  // si la pasada muere a medias, queda constancia de que SE DISPARÓ y no terminó — sin esto,
  // «no se dispara» y «se dispara y no termina» son el mismo silencio. `incomes` no sirve de
  // huella (solo escribe cuando entra una reserva); el Check 4 del health-check lee ultimo_ok_at.
  await registrarLatido('smoobu_sync', false, 'inicio de pasada')

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

  const cnt = { new: 0, modified: 0, cancelled: 0, skipped: 0, reservedAt: 0, aforo: 0, registradas: 0 }
  const logs: any[] = []

  for (const b of all) {
    if (b['is-blocked-booking']) { cnt.skipped++; continue }
    const rid = String(b.id)
    const ci = parseDate(b.arrival)
    const co = parseDate(b.departure)
    const amtGross = typeof b.price === 'string' ? parseFloat(b.price) : (b.price || 0)
    const portal_tmp = PORTAL_MAP[b.channel?.name || ''] || 'OTRO'
    // 🚨 CUÁNTA GENTE VIENE (18/08/2026). Sin el aforo, un €/noche no significa nada: Booking cobra
    // recargo por persona por encima de cierto umbral (medido ese día en House: +24,53€ por persona
    // y noche a partir de 6), así que la misma reserva puede ser cara o barata según el grupo — y sin
    // el dato «¿vendimos barato?» solo se puede opinar. `null` cuando el canal no lo informa: un
    // aforo desconocido NO es cero (regla de CLAUDE.md, tres estados).
    const enteroOno = (v: unknown): number | null => {
      const n = typeof v === 'string' ? parseInt(v, 10) : (typeof v === 'number' ? v : NaN)
      return Number.isFinite(n) && n >= 0 ? n : null
    }
    const adultos = enteroOno(b.adults)
    const ninos = enteroOno(b.children)
    // El precio de Smoobu se escribe TAL CUAL (es el bruto). El neto lo pone el trigger. Ver arriba.
    const amt = amtGross
    const portal = portal_tmp
    const isCancel = b.type === 'cancellation'

    let pid: string | null = null
    if (b.apartment?.name) {
      const k = b.apartment.name.toLowerCase().trim()
      pid = byName.get(k) || null
      if (!pid) for (const [n, i] of byName) if (n.includes(k) || k.includes(n)) { pid = i; break }
    }

    const ex = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, "propertyId", "guestName", portal, amount, amount_gross, "checkIn", "checkOut"
      FROM incomes WHERE "reservationId" = ${rid} LIMIT 1
    `)

    if (isCancel) {
      // 🚨 REGISTRAR ANTES DE BORRAR (12/08/2026). El DELETE de abajo es correcto —una reserva
      // cancelada no se cobra y no puede inflar el calendario— pero hasta hoy era lo ÚNICO que
      // pasaba: el hecho de la cancelación se destruía con la fila y solo sobrevivía como un
      // número en el texto del latido. Ver `lib/sivra/cancelaciones.ts` para el porqué largo.
      //
      // Se guarda TAMBIÉN cuando `ex.length === 0` (la reserva nunca llegó a `incomes`, porque se
      // hizo y se deshizo entre dos pasadas): antes esas caían en `skipped` y desaparecían del
      // todo. `estaba_en_incomes` las mantiene distinguibles para que no cuenten como noches que
      // de verdad perdimos.
      cnt.registradas++
      const fila = filaCancelacion(b, { propertyId: pid, portal, estabaEnIncomes: ex.length > 0 })
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO reservas_canceladas (
          reservation_id, property_id, property_name, portal, guest_name,
          check_in, check_out, nights, amount_gross, reserved_at, estaba_en_incomes, datos
        ) VALUES (
          ${fila.reservation_id}, ${fila.property_id}, ${fila.property_name}, ${fila.portal},
          ${fila.guest_name}, ${fila.check_in}::timestamptz, ${fila.check_out}::timestamptz,
          ${fila.nights}, ${fila.amount_gross}, ${fila.reserved_at}::timestamptz,
          ${fila.estaba_en_incomes}, ${JSON.stringify(b)}::jsonb
        )
        ON CONFLICT (reservation_id) DO UPDATE SET
          property_id = COALESCE(EXCLUDED.property_id, reservas_canceladas.property_id),
          nights      = COALESCE(EXCLUDED.nights,      reservas_canceladas.nights),
          amount_gross= COALESCE(EXCLUDED.amount_gross,reservas_canceladas.amount_gross),
          reserved_at = COALESCE(EXCLUDED.reserved_at, reservas_canceladas.reserved_at),
          datos       = EXCLUDED.datos
      `)
      // El upsert NO pisa `cancelacion_vista_at` ni `estaba_en_incomes`: la primera vez que se vio
      // es la buena, y una segunda pasada (cuando la fila de `incomes` ya no está) diría false y
      // borraría la información de que sí llegó a contar como ingreso.

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
        INSERT INTO incomes ("propertyId", date, amount, portal, "reservationId", "guestName", "checkIn", "checkOut", nights, reserved_at, adults, children)
        VALUES (${pid}, ${ci.toISOString()}::timestamptz, ${amt}, ${portal}::"Portal",
                ${rid}, ${b['guest-name'] || null}, ${ci.toISOString()}::timestamptz,
                ${co?.toISOString() || null}::timestamptz, ${nights(ci, co)},
                ${reservedAt}::timestamptz, ${adultos}::smallint, ${ninos}::smallint)
      `)
      cnt.new++
    } else {
      const row = ex[0]
      // Se compara contra `amount_gross`, NO contra `amount`: `amt` es el precio BRUTO de Smoobu y
      // `amount` es el NETO que calcula el trigger. Compararlos daría siempre distinto y esta pasada
      // reescribiría TODAS las reservas cada vez (churn permanente y `modificadas` sin significado).
      const changed = Math.abs((row.amount_gross ?? row.amount) - amt) > 0.01 ||
        row.checkIn?.toISOString().slice(0, 10) !== ci?.toISOString().slice(0, 10)
      if (changed) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE incomes SET amount=${amt}, "checkIn"=${ci.toISOString()}::timestamptz,
            "checkOut"=${co?.toISOString() || null}::timestamptz, nights=${nights(ci, co)},
            portal=${portal}::"Portal",
            reserved_at = COALESCE(${reservedAt}::timestamptz, reserved_at),
            -- COALESCE con el valor nuevo delante: si Smoobu deja de informar el aforo, se conserva
            -- el que ya teníamos en vez de borrarlo (un NULL nuevo es «no me lo han dicho»).
            adults   = COALESCE(${adultos}::smallint, adults),
            children = COALESCE(${ninos}::smallint, children)
          WHERE "reservationId" = ${rid}
        `)
        cnt.modified++
      } else if (adultos != null || ninos != null) {
        // La fila no cambió de importe ni de fechas, pero puede que le falte el aforo (todas las
        // anteriores al 18/08/2026 lo tienen NULL). Igual que con `reserved_at`, el sync diario va
        // completando el histórico solo, sin depender de un backfill que llegue a todo.
        const rellenadas = await prisma.$executeRaw(Prisma.sql`
          UPDATE incomes SET adults = COALESCE(adults, ${adultos}::smallint),
                             children = COALESCE(children, ${ninos}::smallint)
          WHERE "reservationId" = ${rid}
            AND (adults IS NULL OR children IS NULL)`)
        if (rellenadas > 0) cnt.aforo++
        if (reservedAt) {
          const conFecha = await prisma.$executeRaw(Prisma.sql`
            UPDATE incomes SET reserved_at = ${reservedAt}::timestamptz
            WHERE "reservationId" = ${rid} AND reserved_at IS NULL`)
          if (conFecha > 0) cnt.reservedAt++
        }
        cnt.skipped++
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

  await registrarLatido('smoobu_sync', true,
    `${cnt.new} nuevas, ${cnt.modified} modificadas, ${cnt.cancelled} canceladas, ` +
    `${cnt.registradas} cancelaciones registradas (${all.length} vistas, desde ${from})`)

  return {
    success: true,
    message: `${cnt.new} nuevas, ${cnt.modified} modificadas, ${cnt.cancelled} canceladas` +
      (cnt.reservedAt ? `, ${cnt.reservedAt} con fecha de reserva rellenada` : ''),
    ...cnt, total: all.length, since: from,
  }
}
