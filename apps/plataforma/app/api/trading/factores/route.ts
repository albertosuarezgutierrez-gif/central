import { NextResponse, type NextRequest } from 'next/server'
import { isTradingLecturaAutorizado } from '@/lib/trading/auth'
import { anomaliasUniverso, camposEnvenenados } from '@/lib/trading/calidad-datos'
import { rankearFactores, rankearMagicFormula } from '@central/module-trading'
import type { MetricasFactor, PesosFactor, EntradaMagic } from '@central/module-trading'

// SELECCIÓN por FACTORES (Fase B). El agente reúne fundamentales por su cuenta (FMP/EDGAR) y este
// endpoint rankea el universo por value+quality+momentum (z-scores cross-seccionales) y, si le pasas
// las patas de la fórmula mágica (EBIT/EV + ROIC), también devuelve ese ranking. NO opera ni persiste:
// prioriza QUÉ estudiar; los seleccionados entran al mismo /api/trading/analizar (torneo, barreras, paper).
// El timing técnico es un overlay posterior, nunca la señal primaria (la Fase 1 técnica no batía al mercado).
export async function POST(req: NextRequest) {
  if (!(await isTradingLecturaAutorizado(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { universo, pesos, magic, top } = (await req.json()) as {
    universo: MetricasFactor[]
    pesos?: Partial<PesosFactor>
    magic?: EntradaMagic[]
    top?: number
  }
  if (!Array.isArray(universo) || universo.length === 0)
    return NextResponse.json({ error: 'payload inválido: universo vacío' }, { status: 400 })

  // 🛡️ Guardián de imposibles sobre el payload (auditoría 11/08/2026): este es literalmente el
  // camino del incidente MCD para datos que vengan de FMP/sesión — un outlier contamina los
  // z-scores de TODO el universo enviado. El campo envenenado se anula (no puntúa) y se declara.
  const anomalias = anomaliasUniverso(universo.map(u => ({
    simbolo: u.simbolo, earningsYield: u.earningsYield, fcfYield: u.fcfYield, roic: u.roic, momentum: u.momentum12m,
  })))
  const envenenados = camposEnvenenados(anomalias)
  const universoSano: MetricasFactor[] = universo.map(u => {
    const malos = envenenados.get(u.simbolo)
    if (!malos) return u
    return {
      ...u,
      earningsYield: malos.has('earningsYield') ? undefined : u.earningsYield,
      fcfYield: malos.has('fcfYield') ? undefined : u.fcfYield,
      roic: malos.has('roic') ? undefined : u.roic,
      momentum12m: malos.has('momentum') ? undefined : u.momentum12m,
    }
  })

  const ranking = rankearFactores(universoSano, pesos ?? {})
  const magicFormula = Array.isArray(magic) && magic.length ? rankearMagicFormula(magic) : undefined

  const n = typeof top === 'number' && top > 0 ? top : ranking.length
  return NextResponse.json({
    total: ranking.length,
    pesos: { valor: 0.4, calidad: 0.4, momentum: 0.2, ...(pesos ?? {}) },
    neutralizados: anomalias.map(a => ({ simbolo: a.simbolo, campo: a.campo, motivo: a.motivo })),
    ranking: ranking.slice(0, n),
    magicFormula: magicFormula?.slice(0, n),
  })
}
