import { NextResponse, type NextRequest } from 'next/server'
import { isTradingLecturaAutorizado } from '@/lib/trading/auth'
import { movimientosGestorDataroma, GESTORES_DEFECTO } from '@/lib/trading/dataroma'
import { fundamentalesSimbolo } from '@/lib/trading/edgar'
import { agregarConviccion, piotroskiFScore, seleccionCombinada, type EntradaCombinada } from '@central/module-trading'

// SELECCIÓN COMBINADA (Fase B) — cruza CONVICCIÓN de gurús (Dataroma) × CALIDAD fundamental (Piotroski +
// ROIC de EDGAR). Los gurús dicen QUÉ mirar; la calidad es la PUERTA (solo pasan negocios sólidos). La
// cesta sale DIVERSIFICADA y equiponderada (cap de concentración implícito) para que ningún unicornio
// decida el resultado — la lección del test de gurús-solo (alpha dominado por un único nombre). Devuelve
// además `simbolos` listos para pasar a /validar-oos. Corre en Vercel. SOLO análisis: no opera ni persiste.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!(await isTradingLecturaAutorizado(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { gestores, minPiotroski, minRoic, tam, maxFundamentales } = (await req.json().catch(() => ({}))) as {
    gestores?: string[]; minPiotroski?: number; minRoic?: number; tam?: number; maxFundamentales?: number
  }
  const codigos = Array.isArray(gestores) && gestores.length ? gestores : GESTORES_DEFECTO

  // 1) Convicción de gurús: qué están comprando (Dataroma).
  const porGestor = await Promise.all(codigos.map(async c => ({ gestor: c, movs: await movimientosGestorDataroma(c) })))
  const gestoresConDatos = porGestor.filter(g => g.movs.length > 0).map(g => g.gestor)
  const convicciones = agregarConviccion(porGestor.flatMap(g => g.movs)).filter(c => c.score > 0)

  // 2) Calidad fundamental SOLO de los candidatos con convicción (acota las llamadas a EDGAR por el
  //    rate-limit de la SEC): top-N por convicción.
  const tope = Math.min(typeof maxFundamentales === 'number' && maxFundamentales > 0 ? maxFundamentales : 30, convicciones.length)
  const candidatos = convicciones.slice(0, tope)
  const funds = await Promise.all(candidatos.map(c => fundamentalesSimbolo(c.simbolo)))

  const entradas: EntradaCombinada[] = candidatos.map((c, i) => {
    const f = funds[i]
    const piotroski = f && f.anios.length >= 2 ? piotroskiFScore(f.anios[0].fin, f.anios[1].fin).score : null
    return { simbolo: c.simbolo, guruScore: c.score, comprando: c.comprando, piotroski, roic: f?.roic ?? null }
  })
  const conFundamentales = entradas.filter(e => e.piotroski != null && e.roic != null).length

  // 3) Cruce convicción × calidad → cesta diversificada.
  const sel = seleccionCombinada(entradas, { minPiotroski, minRoic, tam })

  return NextResponse.json({
    gestoresConDatos,          // si vacío en Vercel: revisar códigos/markup de Dataroma
    candidatos: candidatos.length,
    conFundamentales,          // si 0: revisar el acceso a EDGAR (User-Agent SEC)
    params: sel.params,
    pesoPct: sel.pesoPct,
    cesta: sel.cesta,          // aptos (guru + calidad), rankeados, top `tam`
    descartados: sel.descartados.slice(0, 20),
    simbolos: sel.cesta.map(x => x.simbolo),   // listos para /validar-oos
    nota: 'gurús ∩ calidad (Piotroski+ROIC), equiponderada. Valídala en /validar-oos mirando la MEDIANA, no la media (un outlier no debe decidir). SOLO paper.',
  })
}
