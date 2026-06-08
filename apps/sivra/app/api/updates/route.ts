import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Math.max(1, Math.min(90, parseInt(searchParams.get("days") || "30")))
    const type = searchParams.get("type")
    const since = new Date(Date.now() - days * 86400000)
    const typeCond = type ? Prisma.sql`AND type = ${type}` : Prisma.sql``
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ul.*, p.name AS "propertyName"
      FROM update_logs ul
      LEFT JOIN properties p ON p.id = ul."propertyId"
      WHERE ul."syncedAt" >= ${since}
      ${typeCond}
      ORDER BY ul."syncedAt" DESC
      LIMIT 500`)
    return NextResponse.json({ logs: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
