import { NextResponse, type NextRequest } from 'next/server'
import { isTradingLecturaAutorizado } from '@/lib/trading/auth'
import { medirCarteraEstudio } from '@/lib/trading/cartera-estudio-io'

// 💼 Cartera de ESTUDIO: 30.000€ simulados sobre la cohorte congelada más reciente del forward paper,
// valorados en euros con FX real. SOLO estudio — no lee el bróker ni ejecuta órdenes (jamás).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await isTradingLecturaAutorizado(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const cartera = await medirCarteraEstudio()
  if (!cartera) return NextResponse.json({ error: 'sin precios ahora mismo — reintenta en un rato' }, { status: 503 })
  return NextResponse.json({ cartera })
}
