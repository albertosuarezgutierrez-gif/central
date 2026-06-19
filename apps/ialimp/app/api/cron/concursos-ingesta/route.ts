import { NextResponse } from 'next/server'
import { descargarAtom, ingerirAnuncios } from '@/lib/concursos-ingesta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  let xml = ''
  try { xml = await descargarAtom() }
  catch (e: any) { return NextResponse.json({ ok: false, error: 'fetch ATOM: ' + (e?.message || e) }, { status: 200 }) }
  const ingeridos = await ingerirAnuncios(xml)
  return NextResponse.json({ ok: true, ingeridos })
}
