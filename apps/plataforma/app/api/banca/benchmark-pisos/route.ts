import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getPLMensual } from '@/lib/sivra/pl-mensual'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/banca/benchmark-pisos { mes } — la lectura IA del 📈 Benchmark entre pisos de /banca.
// Recompone el P&L por piso del mes (cifras EXACTAS, misma fuente que la pantalla) y pide a la
// pasarela IA GRATIS una comparación en lenguaje natural: quién lidera, quién arrastra y por qué
// (estructura de coste). La IA aporta lectura, NUNCA cifras nuevas. Degrada sin romper.
const SYSTEM = `Eres el analista de rentabilidad de los pisos turísticos de Alberto (Sevilla). Recibes el P&L YA calculado de cada piso en un mes. Compara y devuelve un análisis BREVE y accionable en español.

REGLAS:
- Usa SOLO las cifras que te doy. NO inventes ni recalcules importes.
- 3 a 5 viñetas máximo. Directo, sin relleno.
- Señala: qué piso RINDE MEJOR y cuál ARRASTRA (margen), y la causa probable mirando la estructura de gasto (lavandería, alquiler del local, suministros, comunidad, otros). 1 palanca concreta si aplica.
- Importes en formato español con € detrás (p. ej. 2.162,49€); márgenes en %.
- Empieza cada viñeta con "• ".`

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { mes } = await req.json().catch(() => ({})) as { mes?: string }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: 'Mes requerido (YYYY-MM)' }, { status: 400 })

  let pl
  try {
    pl = await getPLMensual(mes)
  } catch (e) {
    console.error('[benchmark-pisos] getPLMensual', e)
    return NextResponse.json({ texto: 'No se pudo cargar el P&L de los pisos ahora mismo.' })
  }
  if (pl.pisos.length < 2) {
    return NextResponse.json({ texto: 'Hacen falta al menos dos pisos con datos en el mes para comparar.' })
  }

  const lineas = pl.pisos
    .slice()
    .sort((a, b) => b.margen - a.margen)
    .map(p => {
      const g = p.gastos
      return `${p.nombre}: ingresos ${eur(p.ingresos)}, gastos ${eur(g.total)} (lavandería ${eur(g.lavanderia)}, alquiler ${eur(g.alquiler)}, suministros ${eur(g.suministros)}, comunidad ${eur(g.comunidad)}, otros ${eur(g.otros)}), resultado ${eur(p.resultado)} (margen ${p.margen.toFixed(0)}%, ${p.reservas} reservas)`
    })

  const datos = [`Mes: ${mes}`, 'P&L por piso (ordenado de mayor a menor margen):', ...lineas].join('\n')

  try {
    const { aiComplete } = await import('@/lib/ai-client')
    const texto = await aiComplete([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Compara la rentabilidad de estos pisos:\n${datos}` },
    ], { timeoutMs: 22_000 })
    return NextResponse.json({ texto })
  } catch (e) {
    console.error('[benchmark-pisos] aiComplete', e)
    return NextResponse.json({ texto: 'La IA no está disponible ahora mismo. La comparación de arriba sigue siendo válida; inténtalo de nuevo en un momento.' })
  }
}
