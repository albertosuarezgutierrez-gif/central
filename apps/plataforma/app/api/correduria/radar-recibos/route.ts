import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { radarRecibos } from '@/lib/correo/radar-recibos'
import { remitentesConRecibo } from '@/lib/correo/radar-recibos-query'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/radar-recibos — de las compañías que el triaje sabe
 * reconocer (`correduria-recibo`), cuáles han producido alguna vez ese aviso
 * y cuáles nunca (20/09/2026). Read-only, sobre `correo_triaje` (BD propia de
 * plataforma) — no toca la cartera de asegura.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const remitentes = await remitentesConRecibo()
  if (remitentes === null) return NextResponse.json({ estado: 'error', motivo: 'no se pudo consultar correo_triaje' })
  return NextResponse.json({ estado: 'ok', dominios: radarRecibos(remitentes) })
}
