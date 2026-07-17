import { NextRequest, NextResponse } from 'next/server'
import { accesoEmpresas } from '@/lib/empresas-acceso'
import { getEmpresasYRadar, getProvincias, getCnaes, type FiltroEmpresas } from '@/lib/empresas'
import type { TipoEvento } from '@/lib/borme'

export const dynamic = 'force-dynamic'

const TIPOS_VALIDOS: TipoEvento[] = ['concurso', 'disolucion', 'ampliacion_capital', 'cese', 'otro']
const numOr = (v: string | null): number | undefined => {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export async function GET(req: NextRequest) {
  if (!(await accesoEmpresas())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const tipos = (sp.get('tipos')?.split(',').filter((t): t is TipoEvento => TIPOS_VALIDOS.includes(t as TipoEvento))) || undefined
  const filtro: FiltroEmpresas = {
    provincia: sp.get('provincia') || undefined,
    tipos: tipos && tipos.length ? tipos : undefined,
    desde: sp.get('desde') || undefined,
    cnae: sp.get('cnae') || undefined,
    facturacionMin: numOr(sp.get('facturacionMin')),
    facturacionMax: numOr(sp.get('facturacionMax')),
  }
  try {
    const [datos, provincias, cnaes] = await Promise.all([getEmpresasYRadar(filtro), getProvincias(), getCnaes()])
    return NextResponse.json({ ...datos, provincias, cnaes })
  } catch (e) {
    console.error('[api/empresas]', e)
    return NextResponse.json({ empresas: [], radar: [], total: 0, provincias: [], cnaes: [], error: String(e) }, { status: 500 })
  }
}
