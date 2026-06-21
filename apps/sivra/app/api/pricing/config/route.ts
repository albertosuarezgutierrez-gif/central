import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

// GET  /api/pricing/config  → { paused }
// POST /api/pricing/config  { paused: boolean }  → botón de pánico (pausa global)
// Detrás del middleware (login admin) para el GET; el POST exige sesión admin o CRON_SECRET.

export async function GET() {
  const rows = await prisma.$queryRaw<{ paused: boolean }[]>(Prisma.sql`
    SELECT paused FROM pricing_config WHERE id = 1 LIMIT 1`).catch(() => [])
  return NextResponse.json({ ok: true, paused: rows[0]?.paused === true })
}

export async function POST(req: NextRequest) {
  if (!(await isCronAuthorized(req, { allowSession: true }))) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }
  const paused = Boolean(body?.paused)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO pricing_config (id, paused, updated_at) VALUES (1, ${paused}, now())
    ON CONFLICT (id) DO UPDATE SET paused = EXCLUDED.paused, updated_at = now()`)
  return NextResponse.json({ ok: true, paused })
}
