import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/pricing/guard
//
// Red de seguridad "no puede fallar". Corre tras el snapshot diario:
//   #1 Detector de reversión: si el precio BASE actual en Smoobu (rate_snapshots.price_pricelabs
//      del snapshot más reciente) ya NO coincide con el último precio que aplicó nuestro motor
//      (pricing_applied, dry_run=false) en una fecha futura → algo (PriceLabs u otro) lo pisó.
//   #3 Suelo de coste agobiado: si el motor aplicó el precio mínimo (new_price = min_price) en
//      ≥3 fechas de un piso → señal de que a precio de mercado ese piso no cubre costes con holgura.
// Crea alertas en pricing_alerts (dedup 24h).
// Nota: en plataforma se omite el envío push/email (simplificado vs sivra).

const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET o sesión válida
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const secretOk = !!secret && bearer === secret
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  // #1 Reversiones: último precio real aplicado por (piso, fecha) vs base actual de Smoobu.
  const reversions = await prisma.$queryRaw<{
    property_id: string; rate_date: string; new_price: number; base_now: number
  }[]>(Prisma.sql`
    WITH last_applied AS (
      SELECT DISTINCT ON (property_id, rate_date)
        property_id, rate_date, new_price
      FROM pricing_applied
      WHERE dry_run = false
      ORDER BY property_id, rate_date, applied_at DESC
    ),
    snap AS (
      SELECT property_id, rate_date, price_pricelabs
      FROM rate_snapshots
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
        AND price_pricelabs IS NOT NULL
    )
    SELECT la.property_id, la.rate_date::text, la.new_price, snap.price_pricelabs AS base_now
    FROM last_applied la
    JOIN snap USING (property_id, rate_date)
    WHERE la.rate_date >= CURRENT_DATE
      AND snap.price_pricelabs <> la.new_price
    ORDER BY la.property_id, la.rate_date
  `)

  // #3 Suelo de coste: pisos con ≥3 fechas futuras aplicadas al mínimo.
  const floorHits = await prisma.$queryRaw<{ property_id: string; dias: number; min_price: number }[]>(Prisma.sql`
    WITH last_applied AS (
      SELECT DISTINCT ON (property_id, rate_date) property_id, rate_date, new_price
      FROM pricing_applied WHERE dry_run = false
      ORDER BY property_id, rate_date, applied_at DESC
    )
    SELECT la.property_id, COUNT(*)::int AS dias, s.min_price
    FROM last_applied la
    JOIN pricing_settings s ON s.property_id = la.property_id
    WHERE la.rate_date >= CURRENT_DATE AND s.min_price IS NOT NULL AND la.new_price = s.min_price
    GROUP BY la.property_id, s.min_price
    HAVING COUNT(*) >= 3
  `)

  async function pushAlert(a: {
    tipo: string; prioridad: string; property_id: string; titulo: string; detalle: string
    dato_actual?: number; dato_mercado?: number; fecha_ref?: string
  }): Promise<boolean> {
    const ex = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM pricing_alerts
      WHERE tipo = ${a.tipo} AND property_id = ${a.property_id} AND resuelta = false
        AND created_at >= now() - INTERVAL '24 hours'
        AND (${a.fecha_ref ?? null}::date IS NULL OR fecha_ref = ${a.fecha_ref ?? null}::date)
      LIMIT 1`)
    if (ex.length) return false
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO pricing_alerts (tipo, prioridad, property_id, titulo, detalle, dato_actual, dato_mercado, scenario, fecha_ref)
      VALUES (${a.tipo}, ${a.prioridad}, ${a.property_id}, ${a.titulo}, ${a.detalle},
        ${a.dato_actual ?? null}, ${a.dato_mercado ?? null}, 'normal', ${a.fecha_ref ?? null}::date)`)
    return true
  }

  let created = 0
  const newReversions: typeof reversions = []
  for (const r of reversions) {
    const ok = await pushAlert({
      tipo: "precio_revertido", prioridad: "alta", property_id: r.property_id,
      titulo: `${PROP_NAMES[r.property_id] ?? r.property_id}: precio revertido el ${r.rate_date}`,
      detalle: `Fijamos ${r.new_price}€ base y ahora hay ${r.base_now}€ en Smoobu. Revisa que PriceLabs esté desconectado en este piso.`,
      dato_actual: r.new_price, dato_mercado: r.base_now, fecha_ref: r.rate_date,
    })
    if (ok) { created++; newReversions.push(r) }
  }
  for (const f of floorHits) {
    const ok = await pushAlert({
      tipo: "suelo_coste", prioridad: "media", property_id: f.property_id,
      titulo: `${PROP_NAMES[f.property_id] ?? f.property_id}: tocando el precio mínimo`,
      detalle: `El motor fija el suelo de coste (${f.min_price}€) en ${f.dias} fechas. A precio de mercado este piso va justo de margen; revisa costes/calidad.`,
      dato_actual: f.min_price,
    })
    if (ok) created++
  }

  // Loguear reversiones nuevas (sin push/email en plataforma — simplificado)
  if (newReversions.length > 0) {
    console.warn(`[sivra/pricing/guard] ${newReversions.length} precio(s) revertido(s):`, newReversions.map(r => `${r.property_id} ${r.rate_date}`).join(", "))
  }

  return NextResponse.json({
    ok: true,
    reversions: reversions.length,
    floor_hits: floorHits.length,
    alerts_created: created,
  })
}
