import { NextResponse, type NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { descubrir } from '@central/module-trading'
import type { Candidato, CriteriosScreener } from '@central/module-trading'

// DESCUBRIMIENTO autónomo (capa C). El agente reúne candidatos por SU CUENTA de varias fuentes
// —temas de IBKR (Nuclear/Quantum/Defensa…), screener de FMP, picos de volumen— cada uno con su
// `fuentes` y su `volAnual`, y este endpoint los funde, penaliza la volatilidad-lotería y los
// ordena. Devuelve el top para estudiarlo en el mismo /api/trading/analizar (torneo, paper).
// NO opera ni persiste: solo prioriza el descubrimiento.
export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { candidatos, criterios } = (await req.json()) as { candidatos: Candidato[]; criterios?: CriteriosScreener }
  if (!Array.isArray(candidatos)) return NextResponse.json({ error: 'payload inválido' }, { status: 400 })

  // Por defecto: descarta la lotería (vol anual > 80%, la lección de la cartera real).
  const crit: CriteriosScreener = { maxVolAnual: 0.8, ...criterios }
  const seleccion = descubrir(candidatos, crit)

  return NextResponse.json({
    criterios: crit,
    total: seleccion.length,
    seleccion: seleccion.map(c => ({
      simbolo: c.simbolo, precio: c.precio, rvol: c.rvol, volAnual: c.volAnual,
      fuentes: c.fuentes, fundamentales: c.fundamentales,
    })),
  })
}
