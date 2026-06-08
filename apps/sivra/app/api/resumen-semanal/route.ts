import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import nodemailer from "nodemailer"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const hoy     = new Date()
    const lunes   = new Date(hoy); lunes.setDate(hoy.getDate() - hoy.getDay() + 1 - 7)
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
    const d7      = new Date(hoy); d7.setDate(hoy.getDate() + 7)

    const [semana_pasada, proximas_salidas, ocupacion] = await Promise.all([
      // Ingresos semana pasada
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          SUM(CASE WHEN portal = 'BOOKING' THEN amount * 0.8028 ELSE amount END)::numeric(10,2) AS net,
          COUNT(*)::int AS reservas
        FROM incomes
        WHERE "checkIn" >= ${lunes.toISOString().split("T")[0]}::date
          AND "checkIn" <= ${domingo.toISOString().split("T")[0]}::date
      `),
      // Próximas 5 salidas
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT i."checkOut"::text, i."checkIn"::text, i.portal,
               p.name AS property, i.amount
        FROM incomes i LEFT JOIN properties p ON p.id = i."propertyId"
        WHERE i."checkOut" >= ${hoy.toISOString().split("T")[0]}::date
          AND i."checkOut" <= ${d7.toISOString().split("T")[0]}::date
        ORDER BY i."checkOut" ASC LIMIT 5
      `),
      // Ocupación actual (reservas con checkIn pasado y checkOut futuro)
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT COUNT(*)::int AS pisos_ocupados
        FROM incomes
        WHERE "checkIn" <= ${hoy.toISOString().split("T")[0]}::date
          AND "checkOut" >= ${hoy.toISOString().split("T")[0]}::date
      `)
    ])

    const net      = Number(semana_pasada[0]?.net || 0)
    const reservas = Number(semana_pasada[0]?.reservas || 0)
    const ocupados = Number(ocupacion[0]?.pisos_ocupados || 0)

    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#001033;color:white;padding:20px;border-radius:8px;margin-bottom:20px">
    <h2 style="margin:0;font-size:20px">📊 Resumen semanal SIVRA</h2>
    <p style="margin:4px 0;opacity:.7;font-size:13px">${hoy.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}</p>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
    <div style="background:#f0fdf4;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#16a34a">€${Math.round(net).toLocaleString("es-ES")}</div>
      <div style="font-size:11px;color:#666">Ingresos netos semana pasada</div>
    </div>
    <div style="background:#eff6ff;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#2563eb">${reservas}</div>
      <div style="font-size:11px;color:#666">Reservas con checkIn</div>
    </div>
    <div style="background:#faf5ff;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#7c3aed">${ocupados}/4</div>
      <div style="font-size:11px;color:#666">Pisos ocupados hoy</div>
    </div>
    <div style="background:#fff7ed;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#ea580c">${proximas_salidas.length}</div>
      <div style="font-size:11px;color:#666">Salidas próximos 7 días</div>
    </div>
  </div>

  <h3 style="margin:0 0 10px;font-size:14px;color:#374151">🏠 Próximas salidas</h3>
  <table style="width:100%;border-collapse:collapse">
    <tr style="background:#f9fafb">
      <th style="padding:8px;text-align:left;font-size:11px">Propiedad</th>
      <th style="padding:8px;text-align:left;font-size:11px">Checkout</th>
      <th style="padding:8px;text-align:left;font-size:11px">Portal</th>
    </tr>
    ${proximas_salidas.map((s: any) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px;font-size:12px">${s.property || "—"}</td>
      <td style="padding:8px;font-size:12px">${s.checkOut?.slice(0,10) || "—"}</td>
      <td style="padding:8px;font-size:12px">${s.portal}</td>
    </tr>`).join("")}
  </table>

  <div style="margin-top:20px;text-align:center">
    <a href="https://sivra.vercel.app" style="background:#001033;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px">
      Abrir SIVRA →
    </a>
  </div>
</div>`

    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
      })
      await transporter.sendMail({
        from: `"SIVRA" <${process.env.GMAIL_USER}>`,
        to:   process.env.GMAIL_USER,
        subject: `📊 Resumen semanal — €${Math.round(net).toLocaleString("es-ES")} netos`,
        html
      })
    }

    return NextResponse.json({ ok: true, net, reservas, ocupados, proximas: proximas_salidas.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
