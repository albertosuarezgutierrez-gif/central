import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/pricing/pilot-track/historial
// Últimas filas de seguimiento del piloto por piso (para la tarjeta de /pricing-auto).
// Detrás del login admin (middleware).
export async function GET() {
  const rows = await prisma.$queryRaw<{
    property_id: string; tracked_on: string; verdict: string
    days_since_booking: number | null; free_nights_60: number | null
    occupancy_60: number | null; current_base: number | null
    market_p50_guest: number | null; extra_eur: number | null
    diagnosis: string | null; proposal: string | null; open_horizon_days: number | null
    recommended_base: number | null
  }[]>(Prisma.sql`
    SELECT property_id, tracked_on::text, verdict, days_since_booking, free_nights_60,
           occupancy_60, current_base, market_p50_guest, extra_eur, diagnosis, proposal, open_horizon_days,
           recommended_base
    FROM pricing_pilot_tracking
    ORDER BY property_id, tracked_on DESC`)

  // Última fila por piso (la lista ya viene ordenada por fecha desc).
  const ultimo: Record<string, (typeof rows)[number]> = {}
  for (const r of rows) if (!ultimo[r.property_id]) ultimo[r.property_id] = r

  return NextResponse.json({ ok: true, ultimo, historial: rows })
}
