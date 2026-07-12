import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { listarMovimientosLedger } from '@/lib/banca'

export const dynamic = 'force-dynamic'

// GET /api/banca/movimientos?cuenta=&desde=&hasta=&signo=ingreso|gasto&q=&limit=&offset=
// Libro completo de movimientos paginado en servidor (para la vista "ver todos" de /banca).
// Scoped por cuenta_id vía getSession(). Solo lectura.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '50', 10) || 50, 1), 200)
  const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0)
  const signo = sp.get('signo')

  const res = await listarMovimientosLedger(session.id, {
    cuentaBancariaId: sp.get('cuenta') || undefined,
    desde: sp.get('desde') || undefined,
    hasta: sp.get('hasta') || undefined,
    signo: signo === 'ingreso' || signo === 'gasto' ? signo : undefined,
    q: sp.get('q')?.trim() || undefined,
  }, limit, offset)

  return NextResponse.json(res)
}
