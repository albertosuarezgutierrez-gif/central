import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getResumenFinanciero } from '@/lib/finanzas'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/banca/analisis-ia { desde, hasta, periodoLabel } — el panel "✨ Análisis IA del periodo"
// de /banca. Recompone el resumen del periodo (misma fuente que la pantalla, cifras EXACTAS) y pide
// a la pasarela IA GRATIS unos insights en lenguaje natural. La IA aporta lenguaje/lectura, NUNCA
// cifras nuevas: se le pasan los números ya calculados. Degrada sin romper (IA saturada → 200 con
// aviso). No corre en cada carga: solo cuando el dueño pulsa el botón.
const SYSTEM = `Eres el analista financiero de Alberto (persona física, España; correduría de seguros + 4 pisos turísticos + gasto personal). Recibes las CIFRAS ya calculadas de un periodo. Devuelve un análisis BREVE y accionable en español.

REGLAS:
- Usa SOLO las cifras que te doy. NO inventes ni recalcules importes.
- 3 a 5 viñetas máximo. Directo, sin relleno.
- Señala lo relevante: desviación del gasto vs el año anterior, peso de lo personal, resultado del periodo, y 1 consejo fiscal si aplica (gasto deducible, tramo IRPF).
- Importes en formato español con € detrás (p. ej. 2.162,49€).
- Empieza cada viñeta con "• ".`

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { desde, hasta, periodoLabel } = await req.json().catch(() => ({})) as {
    desde?: string; hasta?: string; periodoLabel?: string
  }
  if (!desde || !hasta) return NextResponse.json({ error: 'Periodo requerido' }, { status: 400 })

  const year = Number(desde.slice(0, 4)) || new Date().getFullYear()
  let resumen
  try {
    resumen = await getResumenFinanciero(session.id, year, 0, desde, hasta)
  } catch (e) {
    console.error('[analisis-ia] getResumenFinanciero', e)
    return NextResponse.json({ texto: 'No se pudo cargar el resumen del periodo ahora mismo.' })
  }

  const ingresosNeg = resumen.correduria.cobradoNeto + resumen.pisos.total.ingresos
  const gastoNeg = resumen.correduria.gastosDeducibles + resumen.pisos.total.gastos
  const gastoPersonal = resumen.personal.total
  const gastoTotal = gastoNeg + gastoPersonal
  const resultado = ingresosNeg - gastoTotal
  const ant = resumen.anterior
  const deltaGasto = ant && ant.gastos > 0 ? Math.round(((gastoTotal - ant.gastos) / ant.gastos) * 100) : null
  const topPersonal = [...resumen.personal.bbva.porCategoria, ...resumen.personal.kutxa.porCategoria]
    .sort((a, b) => b.importe - a.importe).slice(0, 5)
    .map(c => `${c.categoria}: ${eur(c.importe)}`).join(', ')

  const datos = [
    `Periodo: ${periodoLabel || `${desde} → ${hasta}`}`,
    `Ingresos negocio: ${eur(ingresosNeg)} (correduría cobrado ${eur(resumen.correduria.cobradoNeto)}, pisos ${eur(resumen.pisos.total.ingresos)})`,
    `Gasto total: ${eur(gastoTotal)} (negocio ${eur(gastoNeg)}, personal ${eur(gastoPersonal)})`,
    `Resultado: ${eur(resultado)}`,
    deltaGasto !== null ? `Gasto vs mismo periodo año anterior: ${deltaGasto >= 0 ? '+' : ''}${deltaGasto}%` : 'Sin comparativa año anterior',
    `Personal por banco: BBVA ${eur(resumen.personal.bbva.gastos)}, Kutxabank ${eur(resumen.personal.kutxa.gastos)}`,
    topPersonal ? `Top categorías personales: ${topPersonal}` : '',
    `Base imponible IRPF estimada (año): ${eur(resumen.fiscal.baseImponibleEstimada)} · tramo marginal ${(resumen.fiscal.tramoActual.tipo * 100).toFixed(0)}%`,
  ].filter(Boolean).join('\n')

  try {
    const texto = await aiCompleteSafe(datos)
    return NextResponse.json({ texto })
  } catch (e) {
    console.error('[analisis-ia] aiComplete', e)
    return NextResponse.json({ texto: 'La IA no está disponible ahora mismo. Los datos del periodo siguen arriba; inténtalo de nuevo en un momento.' })
  }
}

async function aiCompleteSafe(datos: string): Promise<string> {
  const { aiComplete } = await import('@/lib/ai-client')
  return aiComplete([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Analiza este periodo:\n${datos}` },
  ], { timeoutMs: 22_000 })
}
