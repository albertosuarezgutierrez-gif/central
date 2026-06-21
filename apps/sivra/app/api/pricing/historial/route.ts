import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/pricing/historial?property=prop_xxx&limit=50
// Auditoría de cambios de precio aplicados (pricing_applied) para mostrar en el panel.
// Detrás del login admin (middleware).
export async function GET(req: NextRequest) {
  const property = req.nextUrl.searchParams.get("property")
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 60), 1), 200)

  const rows = await prisma.$queryRaw<{
    property_id: string; rate_date: string; old_price: number | null; new_price: number
    dry_run: boolean; created_at: string
  }[]>(Prisma.sql`
    SELECT property_id, rate_date::text, old_price, new_price, dry_run, created_at::text
    FROM pricing_applied
    WHERE (${property}::text IS NULL OR property_id = ${property})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)

  return NextResponse.json({ ok: true, historial: rows })
}
