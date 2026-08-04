import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getMerchantsForCategoria } from '@/lib/finanzas'
import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'

export const dynamic = 'force-dynamic'

const SYSTEM = `Eres el asesor financiero personal de Alberto. Analiza sus datos de gasto personal
por comercio y genera entre 3 y 5 insights concisos y accionables en español.

Devuelve SOLO un array JSON:
[{"tipo":"ahorro|alerta|tendencia","texto":"frase corta, máx 120 chars"}]

- "ahorro": detecta dónde puede ahorrar (comercio más caro, alternativa mejor, patrón de sobrecoste)
- "alerta": aviso de algo a vigilar (categoría que subió mucho, concentración en un solo comercio)
- "tendencia": observación interesante sobre evolución mes a mes

Sé directo y concreto. Menciona nombres de comercios y cantidades cuando ayude.
No repitas datos obvios. No inventes datos que no estén en el input.`

// GET /api/finanzas/categorias/insights?mode=fiscal_year|rolling_12&year=2025&month=6
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'fiscal_year'
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()
  const month = parseInt(searchParams.get('month') || '') || new Date().getMonth() + 1

  // Rango de fechas explícito de la pestaña Categorías (manda sobre year/mode si es válido).
  const ISO = /^\d{4}-\d{2}-\d{2}$/
  const desdeParam = searchParams.get('desde')
  const hastaParam = searchParams.get('hasta')

  let desde: string, hasta: string
  if (desdeParam && hastaParam && ISO.test(desdeParam) && ISO.test(hastaParam)) {
    desde = desdeParam
    hasta = hastaParam
  } else if (mode === 'rolling_12') {
    const hastaDate = new Date(year, month, 0)
    hasta = hastaDate.toISOString().slice(0, 10)
    const desdeDate = new Date(year, month - 12, 1)
    desde = desdeDate.toISOString().slice(0, 10)
  } else {
    desde = `${year}-01-01`
    hasta = `${year}-12-31`
  }

  // Top 5 categorías de gasto personal por volumen
  const topCats = await prisma.$queryRaw<{ subcategoria: string; total: number }[]>`
    SELECT mb.subcategoria, SUM(ABS(mb.importe))::float AS total
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND mb.subcategoria IS NOT NULL
      AND mb.importe < 0
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
    GROUP BY mb.subcategoria
    ORDER BY total DESC
    LIMIT 5
  `

  if (topCats.length === 0) return NextResponse.json({ insights: [] })

  // Datos de comerciantes para cada categoría top
  const merchantsData = await Promise.all(
    topCats.map(c => getMerchantsForCategoria(session.id, c.subcategoria, desde, hasta))
  )

  const context = topCats.map((c, i) => {
    const ms = merchantsData[i].slice(0, 5)
    const msStr = ms.map(m =>
      `  ${m.comerciante}: total €${m.total.toFixed(0)}, ${m.count} ops, ticket €${m.ticket_medio.toFixed(1)}`
    ).join('\n')
    return `## ${c.subcategoria} (€${c.total.toFixed(0)} total)\n${msStr}`
  }).join('\n\n')

  try {
    const raw = await aiComplete([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Período: ${desde} a ${hasta}\n\n${context}` },
    ])
    const clean = raw.replace(/```json|```/g, '').trim()
    const insights = JSON.parse(clean)
    return NextResponse.json({ insights: Array.isArray(insights) ? insights : [] })
  } catch (e) {
    console.error('[insights] IA falló ·', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'La IA no pudo generar insights ahora mismo.' }, { status: 502 })
  }
}
