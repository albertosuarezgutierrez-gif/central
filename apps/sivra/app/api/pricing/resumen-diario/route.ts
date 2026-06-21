import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { notifyOwner } from "@/lib/pricing-notify"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/pricing/resumen-diario  (cron)
// Resumen de pricing del día: cambios reales aplicados en las últimas 24h + alertas abiertas.
// Envía email + push al propietario. No envía nada si no hubo movimiento.
const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req))) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const aplicados = await prisma.$queryRaw<{
    property_id: string; rate_date: string; old_price: number | null; new_price: number
  }[]>(Prisma.sql`
    SELECT property_id, rate_date::text, old_price, new_price
    FROM pricing_applied
    WHERE dry_run = false AND created_at >= now() - INTERVAL '24 hours'
    ORDER BY property_id, rate_date`)

  const alertas = await prisma.$queryRaw<{ titulo: string; prioridad: string }[]>(Prisma.sql`
    SELECT titulo, prioridad FROM pricing_alerts
    WHERE resuelta = false ORDER BY
      CASE prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, created_at DESC
    LIMIT 10`)

  if (aplicados.length === 0 && alertas.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: "Sin movimiento" })
  }

  const filasCambios = aplicados.map(a =>
    `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb">${PROP_NAMES[a.property_id] ?? a.property_id}</td>
     <td style="padding:6px 8px;border:1px solid #e5e7eb">${a.rate_date}</td>
     <td style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;color:#6b7280">${a.old_price ?? "—"}€</td>
     <td style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;font-weight:bold;color:#15803d">${a.new_price}€</td></tr>`).join("")

  const listaAlertas = alertas.map(a =>
    `<li style="margin:4px 0;color:${a.prioridad === "alta" ? "#b91c1c" : "#92400e"}">${a.titulo}</li>`).join("")

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <h2 style="color:#1A2535">📊 SIVRA Pricing — resumen del día</h2>
    ${aplicados.length ? `
      <h3 style="color:#15803d">${aplicados.length} cambio(s) de precio aplicados</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#f9fafb"><th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb">Piso</th>
        <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb">Fecha</th>
        <th style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb">Antes</th>
        <th style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb">Ahora</th></tr>
        ${filasCambios}
      </table>` : `<p style="color:#6b7280">Sin cambios de precio hoy.</p>`}
    ${alertas.length ? `<h3 style="color:#92400e;margin-top:20px">${alertas.length} alerta(s) abiertas</h3>
      <ul style="font-size:13px;padding-left:18px">${listaAlertas}</ul>` : ""}
    <p style="font-size:12px;color:#9ca3af;margin-top:24px">SIVRA · Pricing Auto · ${new Date().toLocaleDateString("es-ES")}</p>
  </div>`

  await notifyOwner({
    subject: `📊 SIVRA Pricing — ${aplicados.length} cambio(s), ${alertas.length} alerta(s)`,
    html,
    push: {
      title: "📊 Resumen de precios",
      body: `${aplicados.length} cambio(s) hoy · ${alertas.length} alerta(s) abiertas`,
      url: "/pricing-auto",
    },
  })

  return NextResponse.json({ ok: true, sent: true, cambios: aplicados.length, alertas: alertas.length })
}
