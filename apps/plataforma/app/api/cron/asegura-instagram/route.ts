// Instagram de Grupo ASegura (04/11/2026) — L/X/V por el dispatcher (`lib/cron-dispatch.ts`).
//
// Genera UNA pieza (imagen 1080×1080 + caption), la pasa por el cepo de copy y la manda a Telegram con
// ✅ Aprobar / 🗑️ Descartar / 🔄 Otro (`asig_*`). NO publica: publicar es el botón de Alberto.
// Lógica: `lib/correduria/instagram-asegura*.ts`. Sustituye a los crons de Instagram de ia-rest.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { generarBorradorIg } from '@/lib/correduria/instagram-asegura-generar'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req, { soloCabecera: true })) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const r = await generarBorradorIg()
  if (r.estado === 'error') return NextResponse.json({ ok: false, ...r }, { status: 503 })
  return NextResponse.json({ ok: true, ...r })
}
