import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// ⛔ RETIRADO (auditoría pricing 18/07/2026, R5 — docs/AUDITORIA-PRICING-2026-07.md).
// El cron real vive en plataforma (/api/sivra/pricing/apply-auto, vercel.json de plataforma).
// Esta copia invocaba el motor viejo de esta app con dryRun=false — ver el stub de ../apply.
export async function GET() {
  return NextResponse.json(
    {
      error: "retirado",
      detail:
        "Cron migrado a plataforma el 17/06/2026 y stub retirado el 18/07/2026. " +
        "Usa /api/sivra/pricing/apply-auto en plataforma-ten-flame.vercel.app.",
    },
    { status: 410 },
  )
}
