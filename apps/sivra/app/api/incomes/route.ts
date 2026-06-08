import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
export async function GET() {
  try {
    const incomes = await prisma.income.findMany({
      include: { property: { select: { name: true } } },
      orderBy: { checkIn: "desc" },
    })
    return NextResponse.json({
      incomes: incomes.map(inc => ({
        id: inc.id, propertyId: inc.propertyId, propertyName: inc.property.name,
        reservationId: inc.reservationId || "", guestName: inc.guestName,
        portal: inc.portal, amount: inc.amount,
        checkIn: inc.checkIn?.toISOString() || null,
        checkOut: inc.checkOut?.toISOString() || null,
        nights: inc.nights || 0, date: inc.date.toISOString(),
      }))
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}