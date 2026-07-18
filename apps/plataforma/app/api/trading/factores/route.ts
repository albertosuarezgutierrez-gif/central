import { NextResponse, type NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { rankearFactores, rankearMagicFormula } from '@central/module-trading'
import type { MetricasFactor, PesosFactor, EntradaMagic } from '@central/module-trading'

// SELECCIÓN por FACTORES (Fase B). El agente reúne fundamentales por su cuenta (FMP/EDGAR) y este
// endpoint rankea el universo por value+quality+momentum (z-scores cross-seccionales) y, si le pasas
// las patas de la fórmula mágica (EBIT/EV + ROIC), también devuelve ese ranking. NO opera ni persiste:
// prioriza QUÉ estudiar; los seleccionados entran al mismo /api/trading/analizar (torneo, barreras, paper).
// El timing técnico es un overlay posterior, nunca la señal primaria (la Fase 1 técnica no batía al mercado).
export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { universo, pesos, magic, top } = (await req.json()) as {
    universo: MetricasFactor[]
    pesos?: Partial<PesosFactor>
    magic?: EntradaMagic[]
    top?: number
  }
  if (!Array.isArray(universo) || universo.length === 0)
    return NextResponse.json({ error: 'payload inválido: universo vacío' }, { status: 400 })

  const ranking = rankearFactores(universo, pesos ?? {})
  const magicFormula = Array.isArray(magic) && magic.length ? rankearMagicFormula(magic) : undefined

  const n = typeof top === 'number' && top > 0 ? top : ranking.length
  return NextResponse.json({
    total: ranking.length,
    pesos: { valor: 0.4, calidad: 0.4, momentum: 0.2, ...(pesos ?? {}) },
    ranking: ranking.slice(0, n),
    magicFormula: magicFormula?.slice(0, n),
  })
}
