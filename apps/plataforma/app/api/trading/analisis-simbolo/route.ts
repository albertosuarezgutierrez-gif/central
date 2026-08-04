import { NextResponse, type NextRequest } from 'next/server'
import { accesoTrading } from '@/lib/trading-acceso'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { analizarConsulta } from '@/lib/trading/analisis-simbolo'

// 🔍 Análisis determinista a demanda por ticker O nombre (buscador de /trading). SOLO estudio.
// Auth = el MISMO acceso que la página /trading (sesión normal de Alberto o cookie de invitado) o el
// token de rutina — el bug del estreno (20/07) fue exigir aquí cookie de SUPERADMIN, que caduca a las
// 8h y el invitado no tiene: la card daba «no encuentro el ticker» con PYPL perfectamente en la caché.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const autorizado = isRoutineAuthorized(req) || (await accesoTrading()) != null
  if (!autorizado) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams.get('simbolo') ?? ''
  const r = await analizarConsulta(q)
  if (!r) return NextResponse.json({ error: 'nada parecido en el universo ni precios para ese ticker' }, { status: 404 })
  if (r.tipo === 'sugerencias') return NextResponse.json({ sugerencias: r.sugerencias })
  return NextResponse.json({ analisis: r.analisis })
}
