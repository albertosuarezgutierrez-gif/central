import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { disponible, listarInstituciones } from '@/lib/gocardless'

export const dynamic = 'force-dynamic'

// GET /api/banca/psd2/instituciones?country=ES — bancos disponibles para conectar.
export async function GET(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!disponible()) return NextResponse.json({ error: 'GoCardless sin configurar', disponible: false }, { status: 200 })

  const country = req.nextUrl.searchParams.get('country') || 'ES'
  try {
    const inst = await listarInstituciones(country)
    return NextResponse.json({ disponible: true, instituciones: inst.map(i => ({ id: i.id, name: i.name })) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error', disponible: true }, { status: 502 })
  }
}
