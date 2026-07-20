import { NextResponse, type NextRequest } from 'next/server'
import { isTradingLecturaAutorizado } from '@/lib/trading/auth'
import { analizarSimbolo } from '@/lib/trading/analisis-simbolo'

// 🔍 Análisis determinista a demanda de UN símbolo (buscador de /trading). SOLO estudio.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await isTradingLecturaAutorizado(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const simbolo = new URL(req.url).searchParams.get('simbolo') ?? ''
  const analisis = await analizarSimbolo(simbolo)
  if (!analisis) return NextResponse.json({ error: 'símbolo desconocido o sin datos de precio' }, { status: 404 })
  return NextResponse.json({ analisis })
}
