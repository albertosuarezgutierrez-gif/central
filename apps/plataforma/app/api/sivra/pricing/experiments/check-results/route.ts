import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"

export const dynamic = "force-dynamic"

// GET /api/sivra/pricing/experiments/check-results
// Cron o manual: actualiza resultados de experimentos pasados
export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET o sesión válida
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const secretOk = !!secret && bearer === secret
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  // 1) Auto-registra experimentos nuevos desde las escrituras live (pricing_applied);
  // 2) cierra los de fechas pasadas con el resultado real (was_booked + ADR).
  // 💓 Con latido (hallazgo 🟡 6, 24/08/2026): las dos funciones SQL pueden desaparecer en una
  // migración y este cron moriría en 500 a diario sin que nadie lo viera — es el que cierra el
  // bucle de aprendizaje (¿la subida se reservó o no?), y su silencio congela el aprendizaje.
  try {
    await prisma.$executeRaw(Prisma.sql`SELECT auto_register_experiments()`)
    await prisma.$executeRaw(Prisma.sql`SELECT update_experiment_results()`)
  } catch (e) {
    await registrarLatido("sivra_experimentos", false, `error: ${String(e).slice(0, 200)}`)
    throw e
  }

  const updated = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM pricing_experiments
    WHERE result_checked_at >= now() - INTERVAL '1 minute'
  `)

  const n = Number(updated[0]?.total ?? 0)
  await registrarLatido("sivra_experimentos", true, `${n} experimento(s) revisados en esta pasada`)

  return NextResponse.json({ ok: true, updated: n })
}
