import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { verificarReservasBooking } from '@/lib/sivra/reservas-booking-vigia'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Cron (cada 15 min, ver lib/cron-dispatch.ts): contrasta contra Smoobu las reservas de Booking
// vistas por correo (avisos «no registrada» + mensajes de huésped sin resolver) y avisa por
// Telegram del agujero. La lógica vive en lib/sivra/reservas-booking-vigia.ts.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  // Latido de INTENTO antes de tocar Smoobu (landmine 31/07/2026): si la pasada muere a medias,
  // que quede constancia de que se disparó.
  await registrarLatido('reservas_booking_vigia', false, 'inicio de pasada').catch(() => {})
  try {
    return NextResponse.json(await verificarReservasBooking())
  } catch (e: any) {
    await registrarLatido('reservas_booking_vigia', false, `error: ${String(e?.message ?? e).slice(0, 200)}`).catch(() => {})
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
