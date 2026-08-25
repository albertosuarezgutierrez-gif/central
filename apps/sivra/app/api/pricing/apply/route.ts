import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// ⛔ RETIRADO (auditoría pricing 18/07/2026, R5 — docs/AUDITORIA-PRICING-2026-07.md).
//
// Este era el motor de pricing ORIGINAL. Los crons se migraron a plataforma (17/06/2026) y el
// motor de allí siguió evolucionando (prior estacional, velocity, techo de mercado, salto de
// evento, raíl por día real, banda muerta…) mientras esta copia se quedó congelada en junio.
// Seguía siendo invocable desde el panel legacy /pricing-auto o con CRON_SECRET — un clic aquí
// escribía en Smoobu con la lógica vieja (sin ninguna guarda), pisando al motor vivo.
//
// El motor CANÓNICO es apps/plataforma/app/api/sivra/pricing/apply (cron apply-auto 3×/día).
// Los raíles del agente (aplicar-propuesta) SIGUEN VIVOS en esta app — solo se retira el motor.
const GONE = () =>
  NextResponse.json(
    {
      error: "retirado",
      detail:
        "Este motor se retiró el 18/07/2026 (copia desactualizada; escribía en Smoobu con lógica vieja). " +
        "Usa el motor de plataforma: /api/sivra/pricing/apply (plataforma-ten-flame.vercel.app).",
    },
    { status: 410 },
  )

export async function GET() { return GONE() }
export async function POST() { return GONE() }
