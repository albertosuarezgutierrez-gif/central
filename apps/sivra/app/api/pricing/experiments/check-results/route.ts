import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

// GET /api/pricing/experiments/check-results
// Cron o manual: actualiza resultados de experimentos pasados
export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req, { allowSession: true }))) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }
  await prisma.$executeRaw(Prisma.sql`SELECT update_experiment_results()`)
  
  const updated = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM pricing_experiments
    WHERE result_checked_at >= now() - INTERVAL '1 minute'
  `)

  return NextResponse.json({ ok: true, updated: Number(updated[0]?.total ?? 0) })
}
