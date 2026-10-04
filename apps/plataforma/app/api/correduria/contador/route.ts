import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { contadorCacheado, esContador } from '@/lib/correduria/contadores-cacheados'

export const dynamic = 'force-dynamic'

// GET /api/correduria/contador?c=llamadas — solo el número, cacheado
// 5 min (ver lib/correduria/contadores-cacheados.ts). `n: null` = no se sabe.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const c = new URL(req.url).searchParams.get('c')
  if (!esContador(c)) return NextResponse.json({ estado: 'error', motivo: 'contador_desconocido' }, { status: 400 })
  const n = await contadorCacheado(c)
  return NextResponse.json(n === null ? { estado: 'error', n: null } : { estado: 'ok', n })
}
