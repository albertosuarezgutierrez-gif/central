import { NextResponse, type NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { fundamentalesSimbolo } from '@/lib/trading/edgar'
import { piotroskiFScore, rankearMagicFormula, type EntradaMagic } from '@central/module-trading'

// SELECCIÓN por CALIDAD/VALOR (Fase B) con fundamentales GRATIS de EDGAR (SEC XBRL). Para cada símbolo
// descarga los 2 últimos ejercicios y calcula el Piotroski F-score (0..9) + ROIC. Si el body trae el
// Enterprise Value por símbolo (`ev`), cierra la fórmula mágica (earnings yield = EBIT/EV) y la rankea.
// NO opera ni persiste: prioriza QUÉ estudiar; los mejores entran al mismo /analizar. SOLO paper.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { simbolos, ev } = (await req.json().catch(() => ({}))) as { simbolos?: string[]; ev?: Record<string, number> }
  const limpio = Array.isArray(simbolos) ? Array.from(new Set(simbolos.map(s => s.trim().toUpperCase()).filter(Boolean))) : []
  if (limpio.length === 0) return NextResponse.json({ error: 'pasa { simbolos:[...] }' }, { status: 400 })

  // Descarga en paralelo; cada símbolo degrada a null si EDGAR no lo resuelve (best-effort).
  const brutos = await Promise.all(limpio.map(s => fundamentalesSimbolo(s)))
  const evUp: Record<string, number> = {}
  for (const [k, v] of Object.entries(ev ?? {})) evUp[k.toUpperCase()] = v

  const magic: EntradaMagic[] = []
  const analisis = limpio.map((simbolo, i) => {
    const f = brutos[i]
    if (!f) return { simbolo, disponible: false as const }
    const piotroski = f.anios.length >= 2 ? piotroskiFScore(f.anios[0].fin, f.anios[1].fin) : undefined
    // Earnings yield solo si el consumidor aporta el EV (EDGAR no trae precio de mercado).
    const evSim = evUp[simbolo]
    const earningsYield = f.ebit != null && evSim && evSim !== 0 ? f.ebit / evSim : undefined
    if (earningsYield != null && f.roic != null) magic.push({ simbolo, earningsYield, roic: f.roic })
    return {
      simbolo, disponible: true as const,
      fyUltimo: f.anios[0]?.fy,
      piotroskiScore: piotroski?.score,
      piotroskiDetalle: piotroski?.detalle,
      roic: f.roic,
      ebit: f.ebit,
      earningsYield,
    }
  })

  const rankingMagic = magic.length ? rankearMagicFormula(magic) : []
  const conDatos = analisis.filter(a => a.disponible).length

  return NextResponse.json({
    total: limpio.length,
    conDatos,          // si viene 0 en Vercel: revisar el User-Agent SEC y el resolver de CIK
    analisis,
    rankingMagic,      // vacío salvo que se pase `ev` por símbolo (EDGAR no da precio)
    nota: conDatos === 0 ? 'sin datos EDGAR: verifica el acceso a la SEC (User-Agent + rate) en producción' : undefined,
  })
}
