import { NextRequest } from "next/server"
import { POST as applyPost } from "../apply/route"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/pricing/apply-auto  (cron diario)
// Aplicación automática: invoca /api/pricing/apply con dryRun=false reenviando la cabecera de
// autorización del cron (CRON_SECRET). El motor sigue respetando la pausa global, la guardia de
// confianza y apply_enabled por piso. Endpoint dedicado para no depender de query-strings en el
// cron path de Vercel.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  url.searchParams.set("dryRun", "false")
  const forged = new NextRequest(url, { headers: req.headers })
  return applyPost(forged)
}
