import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/pricing/resumen-diario  (cron)
// Resumen de pricing del día: cambios reales aplicados en las últimas 24h + alertas abiertas.
// Loguea en consola (sin email en plataforma — simplificado vs sivra).
const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET o sesión válida
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const secretOk = !!secret && bearer === secret
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const aplicados = await prisma.$queryRaw<{
    property_id: string; rate_date: string; old_price: number | null; new_price: number
  }[]>(Prisma.sql`
    SELECT property_id, rate_date::text, old_price, new_price
    FROM pricing_applied
    -- La columna de tiempo de pricing_applied es applied_at, NO created_at (esa sí existe, pero en
    -- pricing_alerts, de ahí la confusión): con created_at el cron moría en 500 a diario desde el 30/07/2026.
    WHERE dry_run = false AND applied_at >= now() - INTERVAL '24 hours'
    ORDER BY property_id, rate_date`)

  const alertas = await prisma.$queryRaw<{ titulo: string; prioridad: string }[]>(Prisma.sql`
    SELECT titulo, prioridad FROM pricing_alerts
    WHERE resuelta = false ORDER BY
      CASE prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, created_at DESC
    LIMIT 10`)

  if (aplicados.length === 0 && alertas.length === 0) {
    // 💓 El día sin movimiento TAMBIÉN late (hallazgo 🟡 6, 24/08/2026): sin esta línea, el cron
    // muerto y el día tranquilo eran el mismo silencio. El «cómo fue el día» vive en el detalle,
    // que el vigía de las 07:45 muestra tal cual — así este job cuenta el día sin spamear Telegram.
    await registrarLatido("sivra_resumen_diario", true, "sin movimiento (0 cambios, 0 alertas abiertas)")
    return NextResponse.json({ ok: true, sent: false, message: "Sin movimiento" })
  }

  // En plataforma solo logueamos el resumen en consola (sin email/push)
  console.log(`[sivra/pricing/resumen-diario] ${new Date().toLocaleDateString("es-ES")} — ${aplicados.length} cambio(s), ${alertas.length} alerta(s) abiertas`)
  for (const a of aplicados) {
    console.log(`  ${PROP_NAMES[a.property_id] ?? a.property_id} ${a.rate_date}: ${a.old_price ?? "—"}€ → ${a.new_price}€`)
  }
  for (const a of alertas) {
    console.log(`  [${a.prioridad}] ${a.titulo}`)
  }

  await registrarLatido("sivra_resumen_diario", true,
    `${aplicados.length} cambio(s) en 24h · ${alertas.length} alerta(s) abiertas` +
    (alertas.length > 0 ? ` (${alertas.slice(0, 3).map(a => a.titulo).join(" · ")})`.slice(0, 300) : ""))

  return NextResponse.json({ ok: true, sent: true, cambios: aplicados.length, alertas: alertas.length })
}
