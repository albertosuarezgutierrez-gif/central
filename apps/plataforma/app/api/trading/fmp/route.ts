import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { fmpDisponible, fmpScreener, fmpFundamentales, fmpRvol, type CriteriosFmp } from '@/lib/fmp'
import type { Candidato } from '@central/module-trading'

// Puerto de FMP para la CANTERA: corre el screener por parámetros y (opcional) enriquece el top N
// con fundamentales (PER/PB), valor razonable (DCF) y rvol. Devuelve `Candidato[]` listos para
// mandar a /api/trading/descubrir. Sin FMP_API_KEY degrada a lista vacía (no rompe).
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  if (!fmpDisponible()) return NextResponse.json({ disponible: false, candidatos: [], nota: 'define FMP_API_KEY' })

  const { criterios, enriquecerTop } = (await req.json().catch(() => ({}))) as
    { criterios?: CriteriosFmp; enriquecerTop?: number }

  let candidatos: Candidato[] = await fmpScreener(criterios ?? {})

  // Enriquecer los primeros N con fundamentales + rvol (limita las llamadas del plan free).
  const n = Math.min(enriquecerTop ?? 15, candidatos.length)
  const enriquecidos = await Promise.all(
    candidatos.slice(0, n).map(async c => {
      const [fundamentales, rvol] = await Promise.all([fmpFundamentales(c.simbolo), fmpRvol(c.simbolo)])
      return { ...c, fundamentales, rvol }
    }),
  )
  candidatos = [...enriquecidos, ...candidatos.slice(n)]

  return NextResponse.json({ disponible: true, total: candidatos.length, candidatos })
}
