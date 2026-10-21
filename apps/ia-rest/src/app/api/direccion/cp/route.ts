import { NextRequest, NextResponse } from 'next/server'
import { provinciaPorCp, validarCp } from '@central/core-direccion'
import { municipiosPorCp } from '@central/core-direccion/servidor'
import { dejaPasar, ipDe } from '@/lib/direccion-cp'

export const runtime = 'nodejs'

// GET /api/direccion/cp?cp=41003 → { municipios: string[] | null, provincia: string | null }.
// SIN login (lo usan la tienda pública y el pedido rápido): límite por IP. Tabla local (INE), sin red externa.
// `municipios: null` = CP que la tabla no conoce (se escribe a mano), no «ninguno».
const LIMITE = new Map<string, { n: number; hasta: number }>()

export async function GET(req: NextRequest) {
  if (!dejaPasar(LIMITE, ipDe(req.headers.get('x-forwarded-for')), Date.now(), 60, 60_000)) {
    return NextResponse.json({ error: 'Demasiadas consultas' }, { status: 429 })
  }
  const v = validarCp(req.nextUrl.searchParams.get('cp'))
  if (!v.ok) return NextResponse.json({ error: 'cp de 5 cifras' }, { status: 400 })
  return NextResponse.json(
    { municipios: municipiosPorCp(v.valor), provincia: provinciaPorCp(v.valor) },
    { headers: { 'cache-control': 'public, max-age=86400' } },
  )
}
