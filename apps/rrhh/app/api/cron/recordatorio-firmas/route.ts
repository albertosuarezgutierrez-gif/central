import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { ejecutarRecordatorios } from '@/lib/firmas-panel'

export const maxDuration = 300

// Vercel Cron: 0 8 * * * (8:00 UTC ≈ 9-10h en España). Recordatorio de firmas pendientes a los
// 3 y 7 días de la solicitud y luego semanal (regla pura en lib/recordatorios-firma.ts).
// Idempotente: como mucho un recordatorio por documento y día (índice único en rrhh.avisos).

const digest = (s: string) => createHash('sha256').update(s).digest()

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  if (!cronSecret || !timingSafeEqual(digest(auth), digest(`Bearer ${cronSecret}`))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await ejecutarRecordatorios()
  return NextResponse.json({ ok: true, ...r })
}
