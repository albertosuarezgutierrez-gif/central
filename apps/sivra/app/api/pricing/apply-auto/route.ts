import { NextRequest } from "next/server"
import { POST as applyPost } from "../apply/route"
import { PRICING_HORIZON_DAYS } from "@/lib/pricing-calendar"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET /api/pricing/apply-auto  (cron diario)
// Aplicación automática: invoca /api/pricing/apply con dryRun=false reenviando la cabecera de
// autorización del cron (CRON_SECRET). El motor sigue respetando la pausa global, la guardia de
// confianza y apply_enabled por piso. Endpoint dedicado para no depender de query-strings en el
// cron path de Vercel.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  url.searchParams.set("dryRun", "false")
  // Tarifica toda la ventana de pricing (365d), no solo los 14d por defecto, para fijar precio en
  // fechas lejanas (larga antelación / eventos). Sigue siendo Busto-only vía apply_enabled.
  if (!url.searchParams.has("days")) url.searchParams.set("days", String(PRICING_HORIZON_DAYS))
  const forged = new NextRequest(url, { headers: req.headers })
  return applyPost(forged)
}
