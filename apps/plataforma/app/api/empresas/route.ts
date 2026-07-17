import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getEmpresasYRadar, getProvincias, type FiltroEmpresas } from '@/lib/empresas'
import type { TipoEvento } from '@/lib/borme'

export const dynamic = 'force-dynamic'

const TIPOS_VALIDOS: TipoEvento[] = ['concurso', 'disolucion', 'ampliacion_capital', 'cese', 'otro']

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const tipos = (sp.get('tipos')?.split(',').filter((t): t is TipoEvento => TIPOS_VALIDOS.includes(t as TipoEvento))) || undefined
  const filtro: FiltroEmpresas = {
    provincia: sp.get('provincia') || undefined,
    tipos: tipos && tipos.length ? tipos : undefined,
    desde: sp.get('desde') || undefined,
  }
  try {
    const [datos, provincias] = await Promise.all([getEmpresasYRadar(filtro), getProvincias()])
    return NextResponse.json({ ...datos, provincias })
  } catch (e) {
    console.error('[api/empresas]', e)
    return NextResponse.json({ empresas: [], radar: [], total: 0, provincias: [], error: String(e) }, { status: 500 })
  }
}
