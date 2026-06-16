import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET  /api/sivra/pricing/config  → { paused }
// POST /api/sivra/pricing/config  { paused: boolean }  → botón de pánico (pausa global)

export async function GET() {
  const rows = await prisma.$queryRaw<{ paused: boolean }[]>(Prisma.sql`
    SELECT paused FROM pricing_config WHERE id = 1 LIMIT 1`).catch(() => [])
  return NextResponse.json({ ok: true, paused: rows[0]?.paused === true })
}

export async function POST(req: NextRequest) {
  // Auth: CRON_SECRET o sesión válida
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const secretOk = !!secret && bearer === secret
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }
  const paused = Boolean(body?.paused)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO pricing_config (id, paused, updated_at) VALUES (1, ${paused}, now())
    ON CONFLICT (id) DO UPDATE SET paused = EXCLUDED.paused, updated_at = now()`)
  return NextResponse.json({ ok: true, paused })
}
