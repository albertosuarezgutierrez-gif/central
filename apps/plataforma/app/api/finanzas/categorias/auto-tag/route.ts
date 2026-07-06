import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
// aiComplete de la pasarela CENTRAL: cadena de fallback NIM → Groq → Gemini → Kimi. El `aiComplete`
// de lib/ai-client sólo pega a NIM (sin fallback), así que una saturación puntual de NVIDIA dejaba
// "0 gastos categorizados" aunque hubiera 85 sin clasificar.
import { aiComplete } from '@central/core-ai'
import { SUBCATEGORIAS_GASTO, DESCRIPCION_GASTO, esSubcategoriaValida } from '@/lib/categorias-personales'

export const dynamic = 'force-dynamic'

// La lista y las descripciones salen de la fuente única (lib/categorias-personales), así que la
// auto-clasificación cubre TODAS las categorías de gasto (antes se dejaba fuera seguro/suministros_piso
// y emitía 'otros' en vez de 'otros_gasto').
const SYSTEM = `Eres el contable personal de Alberto (España). Para cada gasto bancario personal
asigna la subcategoría que mejor describe el gasto. Responde SOLO un array JSON en el mismo orden:
[{"i":0,"subcategoria":"supermercado"}]

Subcategorías disponibles:
${SUBCATEGORIAS_GASTO.map(s => `- ${s}: ${DESCRIPCION_GASTO[s]}`).join('\n')}`

// POST /api/finanzas/categorias/auto-tag — clasifica hasta 50 gastos personales sin subcategoría
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await prisma.$queryRaw<Array<{
    id: string
    concepto: string | null
    concepto_normalizado: string | null
    contraparte: string | null
    importe: unknown
  }>>`
    SELECT mb.id, mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND COALESCE(mb.destino, 'personal') = 'personal'
      AND mb.importe < 0
      AND mb.subcategoria IS NULL
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
    ORDER BY mb.fecha_operacion DESC
    LIMIT 50
  `

  if (rows.length === 0) return NextResponse.json({ tagged: 0 })

  const prompt = rows.map((r, i) => {
    const desc = (r.concepto_normalizado || r.concepto || r.contraparte || '').slice(0, 120)
    return `${i}. [${Math.abs(Number(r.importe)).toFixed(2)}€] ${desc}`
  }).join('\n')

  try {
    const raw = await aiComplete(prompt, { system: SYSTEM, maxTokens: 2048, timeoutMs: 25_000 })
    // Parseo tolerante: los modelos a veces envuelven el JSON en texto o ```fences```. Extraemos el
    // primer array [...] antes de parsear, en vez de exigir que TODA la respuesta sea JSON.
    const match = raw.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(match ? match[0] : raw.replace(/```json|```/g, '').trim()) as Array<{ i: number; subcategoria: string }>

    let tagged = 0
    for (const p of Array.isArray(parsed) ? parsed : []) {
      const row = rows[p.i]
      if (!row) continue
      const sub = esSubcategoriaValida(p.subcategoria) ? p.subcategoria : 'otros_gasto'
      await prisma.$executeRaw`
        UPDATE movimientos_bancarios SET subcategoria = ${sub} WHERE id = ${row.id}::uuid
      `
      tagged++
    }

    return NextResponse.json({ tagged })
  } catch (e) {
    console.error('[auto-tag] IA falló ·', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'La IA no pudo clasificar ahora mismo.' }, { status: 502 })
  }
}
