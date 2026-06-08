import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export async function GET() {
  const alerts = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, created_at, tipo, prioridad, property_id, titulo, detalle,
           dato_actual, dato_mercado, diferencia_pct, scenario, leida, resuelta, fecha_ref
    FROM pricing_alerts
    WHERE resuelta = false
    ORDER BY
      CASE prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
      created_at DESC
    LIMIT 20
  `)
  const unread = alerts.filter((a: any) => !a.leida).length
  return NextResponse.json({ ok: true, alerts, unread })
}

export async function PATCH(req: NextRequest) {
  const { id, leida, resuelta } = await req.json()
  if (leida !== undefined) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE pricing_alerts SET leida = ${leida} WHERE id = ${id}::uuid
    `)
  }
  if (resuelta !== undefined) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE pricing_alerts SET resuelta = ${resuelta}, leida = true WHERE id = ${id}::uuid
    `)
  }
  return NextResponse.json({ ok: true })
}
