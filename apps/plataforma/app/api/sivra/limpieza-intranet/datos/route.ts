import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { accesoLimpieza } from '@/lib/limpieza-acceso'
import { PROPS_CALENDARIO_IDS } from '@/lib/sivra/constantes'
import { paxDe, mezclarNovedades, type Novedad } from '@/lib/sivra/limpieza-intranet'

export const dynamic = 'force-dynamic'

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

// GET /api/sivra/limpieza-intranet/datos?from=AAAA-MM-DD&to=AAAA-MM-DD
// Datos de la pantalla de la limpieza (Sique Brilla) o del preview de Alberto:
//  - reservas: ocupación + nº huéspedes de los 4 pisos. SIN nombres de huéspedes ni importes.
//  - limpiezas: cleaning_sessions de los 4 slugs (las del cron auto-sessions, donde el panel
//    de Alberto escribe nota_propietario).
//  - tareas: limpieza_tareas del rango.
export async function GET(req: NextRequest) {
  const modo = await accesoLimpieza()
  if (!modo) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const hoy = new Date().toISOString().slice(0, 10)
  const from = RE_FECHA.test(sp.get('from') || '') ? sp.get('from')! : hoy
  const to = RE_FECHA.test(sp.get('to') || '') ? sp.get('to')!
    : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  try {
    const [reservasRaw, limpiezas, tareas, nuevasRaw, huerfanasRaw, canceladasRaw, partesRaw] = await Promise.all([
      prisma.$queryRaw<Array<{
        propertyId: string; checkIn: Date | null; checkOut: Date | null
        adults: number | null; children: number | null
      }>>(Prisma.sql`
        SELECT "propertyId", "checkIn", "checkOut", adults::int, children::int
        FROM incomes
        WHERE "propertyId" = ANY(${PROPS_CALENDARIO_IDS}::text[])
          AND "checkOut" >= ${from}::date AND "checkIn" <= ${to}::date
        ORDER BY "checkIn" ASC
      `),
      prisma.$queryRaw<Array<{
        id: string; property_id: string; session_date: Date
        checkout_time: string | null; checkin_time: string | null
        nota_propietario: string | null; notes: string | null
        tipo_limpieza: string | null; completed_at: Date | null
      }>>(Prisma.sql`
        SELECT id, property_id, session_date, checkout_time::text, checkin_time::text,
               nota_propietario, notes, tipo_limpieza, completed_at
        FROM cleaning_sessions
        WHERE property_id = ANY(${PROPS_CALENDARIO_IDS}::text[])
          AND session_date BETWEEN ${from}::date AND ${to}::date
        ORDER BY session_date ASC
      `),
      prisma.$queryRaw<Array<{
        id: string; fecha: Date; property_id: string | null; texto: string; hecha: boolean
      }>>(Prisma.sql`
        SELECT id, fecha, property_id, texto, hecha
        FROM limpieza_tareas
        WHERE fecha BETWEEN ${from}::date AND ${to}::date
        ORDER BY fecha ASC, creado_at ASC
      `),
      // Novedades: reservas que ENTRARON en nuestro sistema en los últimos 14 días («detectada»
      // = createdAt del sync, no cuándo la hizo el huésped en el portal) con estancia aún por venir.
      prisma.$queryRaw<Array<{
        propertyId: string; checkIn: Date | null; checkOut: Date | null
        adults: number | null; children: number | null; detectada: Date
      }>>(Prisma.sql`
        SELECT "propertyId", "checkIn", "checkOut", adults::int, children::int, "createdAt" AS detectada
        FROM incomes
        WHERE "propertyId" = ANY(${PROPS_CALENDARIO_IDS}::text[])
          AND "createdAt" >= now() - interval '14 days'
          AND "checkOut" >= CURRENT_DATE
        ORDER BY "createdAt" DESC
        LIMIT 20
      `),
      // Reservas de Booking que Smoobu NO tiene (vigía reservas_correo_booking, estado huérfana):
      // se pintan ⚠️ para que Sique Brilla no se quede sin verlas mientras Smoobu se arregla. Solo las
      // que tienen piso y fecha identificados — sin eso no hay dónde pintarlas (el Telegram a
      // Alberto sí las lleva todas).
      prisma.$queryRaw<Array<{ ref_booking: string | null; property_id: string; check_in: Date }>>(Prisma.sql`
        SELECT ref_booking, property_id, check_in
        FROM reservas_correo_booking
        WHERE estado = 'huerfana' AND tipo = 'nueva'
          AND property_id IS NOT NULL AND check_in IS NOT NULL
          AND check_in BETWEEN ${from}::date AND ${to}::date
      `),
      // Cancelaciones vistas por el sync en los últimos 14 días. check_in/check_out pueden ser NULL
      // (la fuente no publicó fechas): se muestran igual, sin inventar fechas.
      prisma.$queryRaw<Array<{
        property_id: string; check_in: Date | null; check_out: Date | null; detectada: Date
      }>>(Prisma.sql`
        SELECT property_id, check_in, check_out, cancelacion_vista_at AS detectada
        FROM reservas_canceladas
        WHERE property_id = ANY(${PROPS_CALENDARIO_IDS}::text[])
          AND cancelacion_vista_at >= now() - interval '14 days'
          AND (check_out IS NULL OR check_out >= CURRENT_DATE)
        ORDER BY cancelacion_vista_at DESC
        LIMIT 20
      `),
      // Partes de incidencia de la limpieza (nota y/o foto de Sique Brilla sobre una limpieza concreta).
      // La foto se sirve aparte por /partes/foto?id=N (autenticada); aquí solo va si existe.
      prisma.$queryRaw<Array<{
        id: bigint; property_id: string; fecha: Date; texto: string | null; tiene_foto: boolean
      }>>(Prisma.sql`
        SELECT id, property_id, fecha, texto, (foto IS NOT NULL) AS tiene_foto
        FROM limpieza_partes
        WHERE fecha BETWEEN ${from}::date AND ${to}::date
        ORDER BY creado_at ASC
      `),
    ])

    const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null)

    return NextResponse.json({
      modo,
      reservas: reservasRaw
        .filter(r => r.checkIn && r.checkOut)
        .map(r => ({
          propertyId: r.propertyId,
          checkIn: iso(r.checkIn)!,
          checkOut: iso(r.checkOut)!,
          pax: paxDe(r.adults, r.children),
        })),
      limpiezas: limpiezas.map(l => ({
        id: l.id,
        propertyId: l.property_id,
        fecha: iso(l.session_date)!,
        salida: l.checkout_time ? l.checkout_time.slice(0, 5) : null,
        entrada: l.checkin_time ? l.checkin_time.slice(0, 5) : null,
        nota: l.nota_propietario,
        indicaciones: l.notes,
        tipo: l.tipo_limpieza,
        hecha: Boolean(l.completed_at),
      })),
      tareas: tareas.map(t => ({
        id: t.id, fecha: iso(t.fecha)!, propertyId: t.property_id, texto: t.texto, hecha: t.hecha,
      })),
      // ⚠️ reservas confirmadas en Booking que Smoobu aún no tiene (solo fecha de ENTRADA conocida).
      partes: partesRaw.map(p => ({
        id: Number(p.id), propertyId: p.property_id, fecha: iso(p.fecha)!,
        texto: p.texto, tieneFoto: p.tiene_foto,
      })),
      pendientesSmoobu: huerfanasRaw.map(h => ({
        propertyId: h.property_id, checkIn: iso(h.check_in)!, ref: h.ref_booking,
      })),
      novedades: mezclarNovedades(
        nuevasRaw.map((n): Novedad => ({
          tipo: 'nueva', propertyId: n.propertyId,
          checkIn: iso(n.checkIn), checkOut: iso(n.checkOut),
          pax: paxDe(n.adults, n.children),
          detectada: new Date(n.detectada).toISOString(),
        })),
        canceladasRaw.map((c): Novedad => ({
          tipo: 'cancelada', propertyId: c.property_id,
          checkIn: iso(c.check_in), checkOut: iso(c.check_out),
          pax: null,
          detectada: new Date(c.detectada).toISOString(),
        })),
        6, // solo los últimos avisos: la limpieza no necesita el histórico entero
      ),
    })
  } catch (err) {
    console.error('[limpieza-intranet/datos]', err)
    return NextResponse.json({ error: 'Error cargando datos' }, { status: 500 })
  }
}
