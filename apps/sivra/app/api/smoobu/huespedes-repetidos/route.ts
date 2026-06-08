import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import nodemailer from "nodemailer"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const solo_listar = searchParams.get("solo_listar") === "1"

    const repetidos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        "guestEmail" AS email,
        MIN("guestName") AS nombre,
        COUNT(*)::int AS reservas,
        MAX("checkIn"::text) AS ultima_estancia,
        ROUND(SUM(amount)::numeric, 0) AS gasto_total
      FROM incomes
      WHERE "guestEmail" IS NOT NULL
        AND "guestEmail" != ''
        AND "checkOut" < CURRENT_DATE
      GROUP BY "guestEmail"
      HAVING COUNT(*) >= 2
      ORDER BY reservas DESC, gasto_total DESC
      LIMIT 50
    `)

    if (solo_listar) {
      return NextResponse.json({ huespedes: repetidos, total: repetidos.length })
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return NextResponse.json({
        pendiente: true,
        huespedes: repetidos.length,
        msg: 'Configura GMAIL_APP_PASSWORD para enviar emails'
      })
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    })

    let enviados = 0
    for (const h of repetidos) {
      if (!h.email) continue
      const nombre = h.nombre?.split(' ')[0] || 'viajero'
      const html = `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto">
        <div style="background:#B04E2A;padding:28px;border-radius:10px 10px 0 0">
          <h2 style="color:white;margin:0">House Sevillana</h2>
        </div>
        <div style="background:#fdf6f0;padding:24px;border-radius:0 0 10px 10px">
          <p>Hola ${nombre} 👋</p>
          <p>Gracias por haber elegido House Sevillana ${h.reservas} veces. Es un placer tenerte de vuelta en Sevilla.</p>
          <p>Como huésped especial te ofrecemos un <strong>10% de descuento</strong> reservando directamente.</p>
          <div style="background:white;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
            <div style="font-size:28px;font-weight:700;color:#B04E2A">10% DESCUENTO</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Válido 90 días · Sin intermediarios</div>
          </div>
          <div style="text-align:center">
            <a href="https://www.housesevillana.es" style="background:#B04E2A;color:white;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:700">
              Ver disponibilidad →
            </a>
          </div>
          <p style="font-size:11px;color:#999;margin-top:20px">House Sevillana · Sevilla · Responde "BAJA" para no recibir más emails</p>
        </div>
      </div>`

      try {
        await transporter.sendMail({
          from: `"House Sevillana" <${process.env.GMAIL_USER}>`,
          to: h.email,
          subject: `¡Vuelve a Sevilla con 10% de descuento!`,
          html
        })
        enviados++
        await new Promise(r => setTimeout(r, 1200))
      } catch {}
    }

    return NextResponse.json({ ok: true, enviados, total: repetidos.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
