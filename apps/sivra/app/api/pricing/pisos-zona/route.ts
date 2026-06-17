import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSmoobuKey } from "@/lib/smoobu"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/pricing/pisos-zona  — Fase 2-B (Paso 1)
//
// Lee de Smoobu la ficha de cada apartamento (zona/CP/coords/aforo/tipo) y la upserta en
// `pricing_piso_zona`. Es la base para que el agente consulte los conectores con la zona y
// capacidad REALES de cada piso (no comps genéricos). Defensivo: guarda lo que Smoobu devuelva.

const BASE = "https://login.smoobu.com/api"
const SMOOBU_ID: Record<string, number> = {
  prop_house_sevillana: 352007,
  prop_busto_reform:    352418,
  prop_duplex_center:   352928,
  prop_luxury_busto:    352943,
}

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req, { allowSession: true }))) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }
  const key = await getSmoobuKey()
  if (!key) return NextResponse.json({ error: "sin SMOOBU key" }, { status: 500 })

  const results: any[] = []
  for (const [propId, smoobuId] of Object.entries(SMOOBU_ID)) {
    try {
      const res = await fetch(`${BASE}/apartments/${smoobuId}`, {
        headers: { "Api-Key": key, "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) { results.push({ propId, error: `Smoobu ${res.status}` }); continue }
      const a = await res.json()
      const loc = a.location ?? {}
      const lat = loc.latitude ?? loc.lat ?? null
      const lon = loc.longitude ?? loc.lng ?? null
      const zip = loc.zip ?? loc.postalCode ?? loc.postal_code ?? null
      const maxGuests = a.maxOccupancy ?? a.max_occupancy ?? a.rooms?.maxOccupancy ?? null
      const tipo = a.type?.name ?? a.type ?? null
      const nombre = a.name ?? null

      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_piso_zona (property_id, smoobu_id, nombre, lat, lon, postal_code, max_guests, tipo, raw, updated_at)
        VALUES (${propId}, ${smoobuId}::int, ${nombre}, ${lat}::numeric, ${lon}::numeric,
                ${zip}, ${maxGuests}::int, ${tipo}, ${JSON.stringify(a)}::jsonb, now())
        ON CONFLICT (property_id) DO UPDATE SET
          smoobu_id=EXCLUDED.smoobu_id, nombre=EXCLUDED.nombre, lat=EXCLUDED.lat, lon=EXCLUDED.lon,
          postal_code=EXCLUDED.postal_code, max_guests=EXCLUDED.max_guests, tipo=EXCLUDED.tipo,
          raw=EXCLUDED.raw, updated_at=now()`)
      results.push({ propId, nombre, lat, lon, zip, maxGuests, tipo })
    } catch (e) {
      results.push({ propId, error: String(e).slice(0, 100) })
    }
  }

  return NextResponse.json({ ok: true, pisos: results })
}
