import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import nodemailer from "nodemailer"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const SMOOBU_EXTRANET: Record<string, string> = {
  prop_house_sevillana: "https://login.smoobu.com/en/cockpit/property/352007/rates",
  prop_duplex_center:   "https://login.smoobu.com/en/cockpit/property/352928/rates",
  prop_luxury_busto:    "https://login.smoobu.com/en/cockpit/property/352943/rates",
  prop_busto_reform:    "https://login.smoobu.com/en/cockpit/property/352418/rates",
}

const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

// Ocupación histórica mínima para considerar subir precio
const OCC_THRESHOLD: Record<string, number> = {
  prop_house_sevillana: 75,
  prop_duplex_center:   85,
  prop_luxury_busto:    60,  // más baja porque sabemos que está al 67%
  prop_busto_reform:    80,
}

// Diferencia mínima para actuar (€)
const DIFF_THRESHOLD = 40

export async function GET() {
  // 1. Oportunidades del snapshot de hoy (próximos 21 días, disponible, diff grande)
  const opportunities = await prisma.$queryRaw<{
    property_id: string
    rate_date: string
    price_ours: number
    price_pricelabs: number
    diff: number
    available: number
  }[]>(Prisma.sql`
    SELECT
      rs.property_id,
      rs.rate_date::text,
      rs.price_ours,
      rs.price_pricelabs,
      (rs.price_ours - rs.price_pricelabs) AS diff,
      rs.available
    FROM rate_snapshots rs
    WHERE rs.snapshot_date = CURRENT_DATE
      AND rs.rate_date BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 21
      AND rs.available = 1
      AND rs.price_pricelabs IS NOT NULL
      AND (rs.price_ours - rs.price_pricelabs) >= ${DIFF_THRESHOLD}
      -- Solo propiedades con buena ocupación histórica (Duplex y Busto Reform)
      AND rs.property_id IN ('prop_duplex_center', 'prop_busto_reform')
      -- No registradas ya como experimento
      AND NOT EXISTS (
        SELECT 1 FROM pricing_experiments pe
        WHERE pe.property_id = rs.property_id
          AND pe.rate_date = rs.rate_date
          AND pe.price_set IS NOT NULL
      )
    ORDER BY rs.property_id, rs.rate_date
  `)

  if (opportunities.length === 0) {
    return NextResponse.json({ ok: true, opportunities: 0, message: "Sin oportunidades hoy" })
  }

  // 2. Insertar en pricing_experiments como "pendiente de confirmar" (price_set = price_ours)
  let registered = 0
  for (const op of opportunities) {
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_experiments
          (property_id, rate_date, price_set, price_pricelabs, price_ours, notes)
        VALUES (
          ${op.property_id},
          ${op.rate_date}::date,
          ${op.price_ours}::integer,
          ${op.price_pricelabs}::integer,
          ${op.price_ours}::integer,
          ${'Auto-detectado: diff +' + op.diff + '€ vs PriceLabs. Confirmar en Smoobu.'}
        )
        ON CONFLICT (property_id, rate_date) DO NOTHING
      `)
      registered++
    } catch { /* ya existe */ }
  }

  // 3. Enviar email a Alberto con las oportunidades
  const grouped: Record<string, typeof opportunities> = {}
  for (const op of opportunities) {
    if (!grouped[op.property_id]) grouped[op.property_id] = []
    grouped[op.property_id].push(op)
  }

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1e40af">🎯 SIVRA Pricing — ${opportunities.length} oportunidad${opportunities.length > 1 ? 'es' : ''} detectada${opportunities.length > 1 ? 's' : ''}</h2>
      <p style="color:#6b7280">Nuestro motor supera a PriceLabs en +${DIFF_THRESHOLD}€ o más. Sube estos precios en Smoobu extranet (2 min).</p>

      ${Object.entries(grouped).map(([propId, ops]) => `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0">
          <h3 style="margin:0 0 8px;color:#111827">${PROP_NAMES[propId]}</h3>
          <a href="${SMOOBU_EXTRANET[propId]}" style="color:#3b82f6;font-size:13px">→ Abrir en Smoobu Extranet</a>
          <table style="width:100%;margin-top:12px;border-collapse:collapse;font-size:13px">
            <tr style="background:#f9fafb">
              <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb">Fecha</th>
              <th style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb">PriceLabs</th>
              <th style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;color:#1e40af">Nuestro precio</th>
              <th style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;color:#16a34a">Diferencia</th>
            </tr>
            ${ops.map(op => `
              <tr>
                <td style="padding:6px 8px;border:1px solid #e5e7eb">${op.rate_date}</td>
                <td style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;color:#6b7280">${op.price_pricelabs}€</td>
                <td style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;font-weight:bold;color:#1e40af">${op.price_ours}€</td>
                <td style="padding:6px 8px;text-align:right;border:1px solid #e5e7eb;font-weight:bold;color:#16a34a">+${op.diff}€</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `).join('')}

      <div style="background:#fef3c7;border-radius:8px;padding:12px;margin-top:16px;font-size:13px;color:#92400e">
        <strong>⚡ Ya registrado en SIVRA /pricing automáticamente.</strong>
        En cuanto pase la fecha sabremos si se reservó.
      </div>

      <p style="font-size:12px;color:#9ca3af;margin-top:24px">
        SIVRA · Pricing Lab · ${new Date().toLocaleDateString('es-ES')}
      </p>
    </div>
  `

  // Enviar email si hay credenciales
  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD

  let emailSent = false
  if (gmailUser && gmailPass) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass },
      })
      await transporter.sendMail({
        from: `SIVRA Pricing <${gmailUser}>`,
        to: "alberto.suarez.gutierrez@gmail.com",
        subject: `🎯 ${opportunities.length} oportunidad${opportunities.length > 1 ? 'es' : ''} de precio detectada${opportunities.length > 1 ? 's' : ''} hoy`,
        html: emailHtml,
      })
      emailSent = true
    } catch (e) {
      console.error("Email error:", e)
    }
  }

  return NextResponse.json({
    ok: true,
    opportunities: opportunities.length,
    registered,
    email_sent: emailSent,
    detail: opportunities.map(o => ({
      property: PROP_NAMES[o.property_id],
      date: o.rate_date,
      price_ours: o.price_ours,
      price_pl: o.price_pricelabs,
      diff: o.diff,
    }))
  })
}
