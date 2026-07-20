import { NextResponse, type NextRequest } from 'next/server'
import { isTradingLecturaAutorizado } from '@/lib/trading/auth'
import { medirCarterasEstudio, curvasCarteraEstudio } from '@/lib/trading/cartera-estudio-io'

// 💼 Cartera de ESTUDIO: 30.000€ simulados en CADA cohorte congelada del forward paper, valorados en
// euros con FX real + curva semanal en euros. SOLO estudio — no lee el bróker ni ejecuta órdenes (jamás).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await isTradingLecturaAutorizado(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const [carteras, curvas] = await Promise.all([medirCarterasEstudio(), curvasCarteraEstudio().catch(() => ({}))])
  if (!carteras.length) return NextResponse.json({ error: 'sin precios ahora mismo — reintenta en un rato' }, { status: 503 })
  return NextResponse.json({ carteras, curvas })
}
