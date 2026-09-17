import { NextRequest, NextResponse } from "next/server"
import { smoobuFetch } from "@/lib/smoobu"

const BASE = "https://login.smoobu.com/api"

// GET /api/rates?propertyId=352007&startDate=2026-05-01&endDate=2026-05-31
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const propertyId = sp.get("propertyId")
  const startDate  = sp.get("startDate")
  const endDate    = sp.get("endDate")

  if (!propertyId || !startDate || !endDate)
    return NextResponse.json({ error: "Missing params" }, { status: 400 })

  const res = await smoobuFetch(
    `${BASE}/rates?apartments[]=${propertyId}&start_date=${startDate}&end_date=${endDate}`,
    { next: { revalidate: 0 } }
  )

  if (!res.ok) return NextResponse.json({ error: "Smoobu error", status: res.status }, { status: 502 })

  const data = await res.json()
  const rates = data.data?.[propertyId] ?? {}

  return NextResponse.json({ rates })
}

// POST /api/rates
// Body: { propertyId: string, operations: { dates: string[], daily_price: number, min_length_of_stay: number }[] }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { propertyId, operations } = body

  if (!propertyId || !operations?.length)
    return NextResponse.json({ error: "Missing params" }, { status: 400 })

  const res = await smoobuFetch(`${BASE}/rates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apartment_id: parseInt(propertyId), operations }),
  })

  if (!res.ok) {
    const detail = await res.text()
    return NextResponse.json({ error: "Smoobu write error", detail }, { status: 502 })
  }

  const result = await res.json()
  return NextResponse.json({ ok: true, count: operations.length, result })
}
