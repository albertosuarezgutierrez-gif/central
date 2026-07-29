import { NextResponse, type NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { fmpDisponible, fmpScreener, fmpEnriquecer, type CriteriosFmp } from '@/lib/fmp'
import type { Candidato } from '@central/module-trading'

// Puerto de FMP para la CANTERA. Dos modos:
//  (1) { simbolos:[...] }  → camino GRATIS: enriquece cada símbolo (del universo de temas IBKR) con
//      cotización (precio, rango 52s, tendencia) + fundamentales best-effort. Es el flujo del plan Free.
//  (2) { criterios }       → screener por parámetros: DE PAGO. En Free devuelve [] con nota.
// Sin FMP_API_KEY responde { disponible:false } (no rompe). Devuelve `Candidato[]` para /descubrir.
export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  if (!fmpDisponible()) return NextResponse.json({ disponible: false, candidatos: [], nota: 'define FMP_API_KEY' })

  const { simbolos, criterios, enriquecerTop } = (await req.json().catch(() => ({}))) as
    { simbolos?: string[]; criterios?: CriteriosFmp; enriquecerTop?: number }

  // Modo GRATIS: enriquecer una lista de símbolos ya conocida (p.ej. de get_theme_details de IBKR).
  if (Array.isArray(simbolos) && simbolos.length > 0) {
    const limpio = Array.from(new Set(simbolos.map(s => s.trim().toUpperCase()).filter(Boolean)))
    const enriquecidos = await Promise.all(limpio.map(s => fmpEnriquecer(s)))
    const candidatos = enriquecidos.filter((c): c is Candidato => c !== null)
    return NextResponse.json({ disponible: true, modo: 'enriquecer', total: candidatos.length, candidatos })
  }

  // Modo screener (de pago en Free). Enriquece el top N si devuelve algo.
  const base: Candidato[] = await fmpScreener(criterios ?? {})
  if (base.length === 0) {
    return NextResponse.json({
      disponible: true, modo: 'screener', total: 0, candidatos: [],
      nota: 'el screener no está incluido en el plan Free de FMP; usa { simbolos:[...] } con el universo de temas IBKR',
    })
  }
  const n = Math.min(enriquecerTop ?? 15, base.length)
  const enriquecidos = await Promise.all(
    base.slice(0, n).map(async c => (await fmpEnriquecer(c.simbolo, c.sector)) ?? c),
  )
  const candidatos = [...enriquecidos, ...base.slice(n)]
  return NextResponse.json({ disponible: true, modo: 'screener', total: candidatos.length, candidatos })
}
