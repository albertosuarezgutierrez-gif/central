import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { accesoLimpieza } from '@/lib/limpieza-acceso'
import { PROPS_CALENDARIO_IDS } from '@/lib/sivra/constantes'
import { paxDe } from '@/lib/sivra/limpieza-intranet'

export const dynamic = 'force-dynamic'

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

// GET /api/sivra/limpieza-intranet/datos?from=AAAA-MM-DD&to=AAAA-MM-DD
// Datos de la pantalla de la limpieza (Vanesa) o del preview de Alberto:
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
    const [reservasRaw, limpiezas, tareas] = await Promise.all([
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
    })
  } catch (err) {
    console.error('[limpieza-intranet/datos]', err)
    return NextResponse.json({ error: 'Error cargando datos' }, { status: 500 })
  }
}
