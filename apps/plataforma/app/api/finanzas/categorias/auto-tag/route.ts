import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'

export const dynamic = 'force-dynamic'

const SUBCATEGORIAS_VALIDAS = [
  'supermercado', 'restaurante_bar', 'gasolina', 'farmacia', 'ropa', 'colegio',
  'deporte', 'suscripcion', 'hogar', 'reforma', 'transporte', 'ocio', 'otros',
] as const

const SYSTEM = `Eres el contable personal de Alberto (España). Para cada gasto bancario personal
asigna la subcategoría que mejor describe el gasto. Responde SOLO un array JSON en el mismo orden:
[{"i":0,"subcategoria":"supermercado"}]

Subcategorías disponibles:
- supermercado: compras de alimentación (Mercadona, Carrefour, Lidl, Aldi, etc.)
- restaurante_bar: bares, restaurantes, cafeterías, comida rápida, delivery
- gasolina: estaciones de servicio, combustible, peajes
- farmacia: farmacias, parafarmacia, ópticas
- ropa: ropa, calzado, complementos, Zara, H&M, etc.
- colegio: colegios, academias, material escolar, actividades extraescolares
- deporte: gimnasios, deporte, piscinas, golf, equipamiento deportivo
- suscripcion: Netflix, Spotify, Amazon Prime, software, apps, hosting
- hogar: ferretería, muebles, electrodomésticos, decoración
- reforma: obras, fontanería, electricidad, reformas, pinturas
- transporte: taxi, Uber, Cabify, parking, transporte público, tren, avión
- ocio: cine, teatro, espectáculos, juegos, viajes personales
- otros: cualquier gasto personal que no encaje en las anteriores`

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
    const raw = await aiComplete([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ])
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean) as Array<{ i: number; subcategoria: string }>

    let tagged = 0
    for (const p of Array.isArray(parsed) ? parsed : []) {
      const row = rows[p.i]
      if (!row) continue
      const sub = SUBCATEGORIAS_VALIDAS.includes(p.subcategoria as typeof SUBCATEGORIAS_VALIDAS[number])
        ? p.subcategoria
        : 'otros'
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
