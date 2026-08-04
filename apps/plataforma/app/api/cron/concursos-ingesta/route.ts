import { NextRequest, NextResponse } from 'next/server'
import { descargarAtom, ingerirAnuncios } from '@/lib/concursos-ingesta'
import { isCronAuthorized } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  let xml = ''
  try { xml = await descargarAtom() }
  catch (e: any) { return NextResponse.json({ ok: false, error: 'fetch ATOM: ' + (e?.message || e) }, { status: 200 }) }
  const ingeridos = await ingerirAnuncios(xml)
  return NextResponse.json({ ok: true, ingeridos })
}
