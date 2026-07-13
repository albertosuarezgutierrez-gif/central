import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getTesoreria } from '@/lib/tesoreria'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/banca/fugas — ✂️ Fugas en recurrentes. Reutiliza los GASTOS recurrentes que ya detecta la
// tesorería (getTesoreria), anualiza su coste, y le pide a la IA GRATIS que marque cuáles parecen
// suscripciones/servicios PRESCINDIBLES o RENEGOCIABLES (fugas de dinero silenciosas). La IA solo
// clasifica y da el motivo; los importes salen de la tesorería (nunca inventa cifras). Degrada sin romper.
type Fuga = { concepto: string; importeMes: number; costeAnual: number; tipo: 'cancelar' | 'renegociar'; motivo: string }

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let tes
  try {
    tes = await getTesoreria(session.id)
  } catch (e) {
    console.error('[fugas] getTesoreria', e)
    return NextResponse.json({ fugas: [], nota: 'No se pudo cargar la tesorería ahora mismo.' })
  }

  // Solo gastos recurrentes con señal suficiente (≥3 ocurrencias). Anualizamos por su intervalo.
  const candidatos = tes.recurrentes
    .filter(r => r.importeMedio < 0 && r.ocurrencias >= 3 && r.intervaloDias > 0)
    .map(r => ({
      concepto: r.concepto,
      importeMes: Math.abs(r.importeMedio),
      costeAnual: Math.round(Math.abs(r.importeMedio) * (365 / r.intervaloDias)),
      intervaloDias: r.intervaloDias,
    }))
    .sort((a, b) => b.costeAnual - a.costeAnual)
    .slice(0, 20)

  if (!candidatos.length) {
    return NextResponse.json({ fugas: [], nota: 'No he detectado gastos recurrentes claros en el histórico reciente. 👍' })
  }

  const lista = candidatos.map((c, i) => `${i}. ${c.concepto} — ${eur(c.importeMes)} cada ~${c.intervaloDias}d (≈${eur(c.costeAnual)}/año)`).join('\n')
  const SYSTEM = `Eres el asesor de gasto de Alberto (persona física, España). Recibes una lista NUMERADA de sus GASTOS RECURRENTES (suscripciones, recibos, cuotas). Marca SOLO los que parezcan una FUGA: suscripción/servicio prescindible o claramente RENEGOCIABLE (telefonía, seguros, streaming duplicados, gimnasios sin uso, software…).

REGLAS:
- NO marques recibos ineludibles (hipoteca, préstamo, IBI, comunidad, suministros básicos, impuestos, TGSS/autónomos).
- Para cada fuga: tipo "cancelar" (prescindible) o "renegociar" (se puede bajar el precio).
- Motivo BREVE (máx 90 chars), en español.
- Responde SOLO JSON, sin markdown: {"fugas":[{"i":<número de la lista>,"tipo":"cancelar|renegociar","motivo":"..."}]}
- Si ninguno es fuga, responde {"fugas":[]}.`

  try {
    const { aiComplete } = await import('@/lib/ai-client')
    const raw = await aiComplete([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Gastos recurrentes:\n${lista}` },
    ], { timeoutMs: 22_000 })
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0] || clean) as { fugas?: Array<{ i?: number; tipo?: string; motivo?: string }> }
    const fugas: Fuga[] = (parsed.fugas || [])
      .map(f => {
        const c = typeof f.i === 'number' ? candidatos[f.i] : undefined
        if (!c) return null
        const tipo = f.tipo === 'cancelar' ? 'cancelar' : 'renegociar'
        return { concepto: c.concepto, importeMes: c.importeMes, costeAnual: c.costeAnual, tipo, motivo: (f.motivo || '').slice(0, 120) } as Fuga
      })
      .filter((f): f is Fuga => f !== null)
    const ahorroAnual = fugas.reduce((s, f) => s + f.costeAnual, 0)
    return NextResponse.json({ fugas, ahorroAnual, revisados: candidatos.length })
  } catch (e) {
    console.error('[fugas] aiComplete', e)
    return NextResponse.json({ fugas: [], nota: 'La IA no está disponible ahora mismo. Inténtalo de nuevo en un momento.' })
  }
}
