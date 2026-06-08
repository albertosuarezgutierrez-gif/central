import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

function parseBookingText(text: string) {
  const get = (pattern: RegExp) => { const m = text.match(pattern); return m ? m[1] : null }
  const getNum = (pattern: RegExp) => {
    const m = text.match(pattern)
    return m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) : null
  }
  return {
    invoiceNumber: get(/N[úu]mero de factura[:\s]+(\d+)/i),
    periodStart:   get(/Periodo[:\s]+(\d{2}\/\d{2}\/\d{4})/i),
    periodEnd:     (() => { const m = text.match(/Periodo[:\s]+\d{2}\/\d{2}\/\d{4}\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/i); return m ? m[1] : null })(),
    facturacion:   getNum(/Reservas\s+EUR\s+([\d.,]+)/i),
    comision:      getNum(/Comisi[oó]n\s+EUR\s+([\d.,]+)/i),
    servicePago:   getNum(/Cargo por servicio.*?EUR\s+([\d.,]+)/i),
    ivaPct:        (() => { const m = text.match(/(\d+)%\s+de\s+IVA/i); return m ? parseInt(m[1]) : 21 })(),
    ivaBase:       getNum(/(\d+)%\s+de\s+IVA\s+sobre\s+([\d.,]+)EUR/i),
    iva:           getNum(/IVA.*?EUR\s+([\d.,]+)$/im),
    total:         getNum(/Importe total pendiente\s+EUR\s+([\d.,]+)/i),
    alojamientoId: get(/ID del alojamiento[:\s]+(\d+)/i),
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, autoCreate, propiedad } = body
    if (!text) return NextResponse.json({ error: "Falta campo text" }, { status: 400 })

    const p = parseBookingText(text)
    if (!p.total) return NextResponse.json({ error: "No se pudo extraer el importe total", parsed: p }, { status: 422 })

    if (!autoCreate) return NextResponse.json({ success: true, parsed: p })

    // Build date from period end
    let fecha = new Date().toISOString().slice(0, 10)
    if (p.periodEnd) {
      const [d, m, y] = p.periodEnd.split("/")
      fecha = `${y}-${m}-${d}`
    }

    const period = p.periodStart && p.periodEnd ? `${p.periodStart} – ${p.periodEnd}` : "Sin periodo"
    const invoiceRef = p.invoiceNumber ? `Factura #${p.invoiceNumber}` : ""
    const concepto = `Comisión Booking.com ${period}${invoiceRef ? " · " + invoiceRef : ""}`
    const base = p.ivaBase ?? ((p.comision ?? 0) + (p.servicePago ?? 0))
    const iva = p.iva ?? 0
    const ivaPct = p.ivaPct ?? 21
    const total = p.total
    const propLabel = propiedad || "Multi-propiedad"
    const notas = [
      p.comision ? `Comisión: ${p.comision}€` : null,
      p.servicePago ? `Servicio pagos: ${p.servicePago}€` : null,
      `IVA ${ivaPct}%: ${iva}€`,
      p.invoiceNumber ? `Nº factura: ${p.invoiceNumber}` : null,
    ].filter(Boolean).join(" · ")

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO gastos (fecha, proveedor, concepto, categoria, subcategoria,
        base_imponible, iva, iva_porcentaje, total, propiedad, notas, numero_factura)
      VALUES (
        ${fecha}::date, ${"Booking.com"}, ${concepto}, ${"PLATAFORMAS"}, ${"Comisión canal"},
        ${base}::numeric, ${iva}::numeric, ${ivaPct}::numeric, ${total}::numeric,
        ${propLabel}, ${notas}, ${p.invoiceNumber ?? ""}
      )
    `)

    return NextResponse.json({
      success: true,
      message: `Gasto creado: ${concepto} – ${total}€`,
      parsed: p,
      created: { fecha, proveedor: "Booking.com", concepto, categoria: "PLATAFORMAS", total, base, iva, propiedad: propLabel }
    })
  } catch (e: any) {
    console.error("parse-booking:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
