import { NextRequest, NextResponse } from "next/server"
import { POST as applyPost } from "../apply/route"
import { PRICING_HORIZON_DAYS } from "@/lib/pricing-calendar"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"
import { detalleApply, pasadaFiable, type FalloEscritura } from "@/lib/sivra/pricing-latido-apply"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET /api/sivra/pricing/apply-auto  (cron diario)
// Aplicación automática: invoca /api/sivra/pricing/apply con dryRun=false reenviando la cabecera de
// autorización del cron (CRON_SECRET). El motor sigue respetando la pausa global, la guardia de
// confianza y apply_enabled por piso.
//
// 💓 Y deja su LATIDO (23/08/2026). Era el único eslabón de la cadena de pricing sin huella propia,
// justo el que escribe el precio que ve el huésped: los otros siete jobs sí latían. Sin ella, cero
// filas en `pricing_applied` no distinguía «corrió y nada cruzó el 3%» de «no corrió» — el 22/08
// hubo que deducirlo a mano contra `lib/cron-dispatch.ts`. Ojo: la entrada `pricing` del registro
// vigila OTRA cosa (la Rutina semanal, vía `pricing_decisiones.ciclo_at`).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  url.searchParams.set("dryRun", "false")
  // Tarifica toda la ventana de pricing (365d), no solo los 14d por defecto.
  if (!url.searchParams.has("days")) url.searchParams.set("days", String(PRICING_HORIZON_DAYS))
  const forged = new NextRequest(url, { headers: req.headers })

  // 🚨 Latido de INTENTO antes de empezar (lección del 31/07/2026, `facturas-scan`): esta ruta tiene
  // `maxDuration = 300` y tarifica 365 días × 4 pisos contra Smoobu. Si muere a mitad, sin esta
  // marca no habría NINGUNA huella y el aviso diría «no se dispara» mandando a mirar el cron, cuando
  // el fallo real sería «se dispara y no termina». No toca `ultimo_ok_at`, así que no falsea nada.
  await registrarLatido("sivra_pricing_apply", false, "pasada en curso — aún sin completar")

  let res: NextResponse
  try {
    res = await applyPost(forged) as NextResponse
  } catch (e) {
    // Una pasada que revienta no puede quedar como silencio.
    await registrarLatido("sivra_pricing_apply", false, `error: ${String(e).slice(0, 160)}`)
    throw e
  }

  // El cuerpo se lee de una copia: la respuesta original sigue intacta para quien llamó.
  try {
    const b = await res.clone().json() as {
      ok?: boolean; properties?: number; fechas_escritas?: number
      smoobu_rechazos?: FalloEscritura[]; sin_tarifar?: unknown[]; dryRun?: boolean
      degradado?: string; pl_degradado?: string; demanda_degradada?: string
      paused?: boolean; message?: string; rail_ciego?: string; lecturas_degradadas?: string
    }
    const parte = {
      pisos: b.properties ?? 0,
      fechasEscritas: b.fechas_escritas ?? 0,
      sinTarifar: b.sin_tarifar?.length ?? 0,
      fallos: b.smoobu_rechazos ?? [],
      // `demanda_degradada` NO entra: el motor la declara como degradación MENOR a propósito (los
      // precios son defendibles, solo más bajos) y ya tiene su Telegram. Meterla aquí pondría el
      // latido rojo por algo que no invalida la pasada.
      // `rail_ciego` SÍ entra: la pasada se abortó entera, es lo más grave que puede pasar aquí.
      // `lecturas_degradadas` también (hallazgo 4, 24/08/2026): la pasada tarificó con fallback y
      // los precios parecen bien — el latido rojo es la única forma de que alguien lo mire.
      degradaciones: [b.degradado, b.pl_degradado, b.rail_ciego, b.lecturas_degradadas].filter((x): x is string => !!x),
      dryRun: b.dryRun ?? false,
      paused: b.paused ?? false,
      nota: b.message ?? null,
    }
    await registrarLatido("sivra_pricing_apply", pasadaFiable(parte), detalleApply(parte))
  } catch (e) {
    // No se pudo leer el parte: la pasada PUEDE haber ido bien, pero no se sabe — y un «no lo sé»
    // no se sirve como pasada buena.
    await registrarLatido("sivra_pricing_apply", false, `respuesta ilegible: ${String(e).slice(0, 120)}`)
  }

  return res
}
