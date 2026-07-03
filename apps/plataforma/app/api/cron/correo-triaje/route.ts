// /api/cron/correo-triaje — Pasada del triaje de correo (cada ~10 min).
// Auth: Bearer CRON_SECRET (o ?secret= para disparo manual). Ver lib/correo/triaje.ts.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { pasadaTriaje } from '@/lib/correo/triaje'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const stats = await pasadaTriaje()
    return NextResponse.json({ ok: true, ...stats })
  } catch (e) {
    console.error('[cron/correo-triaje]', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
