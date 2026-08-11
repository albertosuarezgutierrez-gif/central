import { NextResponse, type NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { rankearCantera, pasaScreener } from '@central/module-trading'
import type { Candidato, CriteriosScreener } from '@central/module-trading'

// Buscador de la CANTERA (capa C): el agente (sesión Claude) trae candidatos de FMP
// (screener por volumen/PER/PB/valor razonable) + precios/volumen de IBKR, y este endpoint
// aplica los criterios y los ordena. NO persiste ni opera: solo filtra + rankea.
// Los que pasan se estudian luego con /api/trading/analizar (mismo torneo, paper).
export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { candidatos, criterios } = (await req.json()) as { candidatos: Candidato[]; criterios: CriteriosScreener }
  if (!Array.isArray(candidatos)) return NextResponse.json({ error: 'payload inválido' }, { status: 400 })

  const crit = criterios ?? { rvolMin: 2 }   // por defecto: volumen inusual (≥2× media)
  const seleccion = rankearCantera(candidatos, crit)
  const descartados = candidatos
    .filter(c => !pasaScreener(c, crit).pasa)
    .map(c => ({ simbolo: c.simbolo, motivos: pasaScreener(c, crit).motivos }))

  return NextResponse.json({
    criterios: crit,
    seleccion: seleccion.map(c => ({ simbolo: c.simbolo, precio: c.precio, rvol: c.rvol, fundamentales: c.fundamentales })),
    total: seleccion.length,
    descartados: descartados.length,
  })
}
