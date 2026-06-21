import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Booking = agency model: net = gross × 0.8028
const BOOKING_NET_FACTOR = 0.8028

const PM: Record<string, string> = {
  "Booking.com":    "BOOKING",
  "Airbnb":         "AIRBNB",
  "VRBO / HomeAway":"VRBO",
  "Expedia":        "EXPEDIA",
  "Agoda":          "AGODA",
  "Reserva directa":"DIRECTO",
  "Sitio web":      "DIRECTO",
}

function pd(s: string): Date | null {
  if (!s) return null
  const p = s.split(".")
  if (p.length !== 3) return null
  return new Date(`20${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}T12:00:00Z`)
}

function pl(line: string, sep: string): string[] {
  const r: string[] = []; let c = "", q = false
  for (const ch of line) {
    if (ch === '"') { q = !q; continue }
    if (ch === sep && !q) { r.push(c.trim()); c = ""; continue }
    c += ch
  }
  r.push(c.trim()); return r
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get("file") as File
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

    const text = await file.text()
    const lines = text.replace(/\r/g, "").split("\n").filter((l: string) => l.trim())
    const header = lines[0].replace(/^\uFEFF/, "")
    const sep = header.includes(";") ? ";" : ","
    const hdrs = pl(header, sep).map((h: string) => h.toLowerCase().replace(/"/g, "").trim())

    const i = {
      id:     hdrs.findIndex((h: string) => h.includes("posici")),
      llegada:hdrs.findIndex((h: string) => h === "llegada"),
      salida: hdrs.findIndex((h: string) => h === "salida"),
      prop:   hdrs.findIndex((h: string) => h === "propiedad"),
      hues:   hdrs.findIndex((h: string) => h.includes("sped")),
      portal: hdrs.findIndex((h: string) => h.includes("portal")),
      precio: hdrs.findIndex((h: string) => h === "precio"),
      noches: hdrs.findIndex((h: string) => h.includes("noches")),
    }

    const propNames = new Set<string>()
    for (let r = 1; r < lines.length; r++) {
      const row = pl(lines[r], sep)
      const n = row[i.prop]?.trim()
      if (n) propNames.add(n)
    }

    const propMap: Record<string, string> = {}
    for (const name of propNames) {
      let prop = await prisma.property.findFirst({ where: { name } })
      if (!prop) prop = await prisma.property.create({ data: { name, location: "Sevilla" } })
      propMap[name] = prop.id
    }

    let imported = 0, skipped = 0, errors = 0

    for (let r = 1; r < lines.length; r++) {
      try {
        const row     = pl(lines[r], sep)
        const rid     = row[i.id]?.trim()
        const propName= row[i.prop]?.trim()
        const pid     = propName ? propMap[propName] : undefined
        if (!rid || !pid) { skipped++; continue }

        const existing = await prisma.income.findFirst({ where: { reservationId: rid } })
        if (existing) { skipped++; continue }

        const checkIn    = pd(row[i.llegada])
        const amountGross= parseFloat(row[i.precio]?.replace(",", ".").replace(/[^0-9.]/g, "")) || 0
        if (!checkIn || amountGross <= 0) { skipped++; continue }

        const portalKey  = row[i.portal]?.trim()
        const portal     = (PM[portalKey] || "OTRO") as "BOOKING" | "AIRBNB" | "VRBO" | "DIRECTO" | "EXPEDIA" | "AGODA" | "OTRO"
        // Booking: net = gross × 0.8028; others: already net
        const amount     = portal === "BOOKING" ? Math.round(amountGross * BOOKING_NET_FACTOR * 100) / 100 : amountGross

        await prisma.income.create({
          data: {
            propertyId:    pid,
            date:          checkIn,
            amount,
            amount_gross:  amountGross,
            portal,
            reservationId: rid,
            guestName:     row[i.hues]?.trim() || null,
            checkIn,
            checkOut: pd(row[i.salida]) || undefined,
            nights:   parseInt(row[i.noches]) || 0,
          }
        })
        imported++
      } catch { errors++ }
    }

    return NextResponse.json({
      success: true, imported, skipped, errors,
      message: `${imported} reservas importadas. ${skipped} ya existian u omitidas. ${errors} errores.`
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
