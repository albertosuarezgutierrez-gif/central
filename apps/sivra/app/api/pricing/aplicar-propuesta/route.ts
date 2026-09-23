import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// ⛔ RETIRADO (auditoría pricing 23/09/2026).
//
// Era una COPIA de los raíles del agente de pricing, desplegada y viva en paralelo a la canónica de
// plataforma. La skill `pricing-agente` ya solo usaba la de plataforma, pero esta seguía escribiendo
// en Smoobu: con autorización más débil (su `cron-auth` dejaba pasar a cualquiera sin CRON_SECRET) y
// sin los arreglos que recibe la de plataforma (p. ej. no escribir fechas sin precio de referencia).
// Mismo destino que el motor viejo (`../apply`, retirado el 18/07/2026).
//
// El raíl CANÓNICO es plataforma: POST /api/sivra/pricing/aplicar-propuesta.
const GONE = () =>
  NextResponse.json(
    {
      error: "retirado",
      detail:
        "Esta copia de los raíles se retiró el 23/09/2026. " +
        "Usa el raíl de plataforma: POST /api/sivra/pricing/aplicar-propuesta.",
    },
    { status: 410 },
  )

export async function GET() { return GONE() }
export async function POST() { return GONE() }
