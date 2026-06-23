import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'
import type { GastoBucket } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

// POST /api/finanzas/gastos/sugerir { id } — la IA propone bucket + amortizable + motivo para un
// cargo. SOLO sugiere; la escritura la confirma el dueño con un toque (destino + amortizable).
const SYSTEM = `Eres el contable de Alberto (persona física, España). Clasificas un cargo bancario
en uno de estos buckets de deducibilidad y dices si es un bien AMORTIZABLE:
- "negocio": gasto de su actividad económica (correduría de seguros).
- "renta": gasto de sus pisos turísticos en alquiler (suministros, reparaciones, mobiliario, plataformas, comunidad…).
- "no_deducible": gasto personal/familiar (supermercado, ocio, ropa, restaurantes sin relación clara con el trabajo…).
"amortizable": true SOLO si es MOBILIARIO, ELECTRODOMÉSTICO, EQUIPO u OBRA/REFORMA (un bien duradero
que se amortiza en años), normalmente importe alto. Compras de consumo corriente → false.
Responde SOLO JSON sin markdown: {"bucket":"negocio|renta|no_deducible","amortizable":true|false,"motivo":"breve, máx 90 chars"}.`

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const rows = await prisma.$queryRaw<Array<{ concepto: string | null; concepto_normalizado: string | null; contraparte: string | null; importe: unknown; banco: string | null }>>`
    SELECT mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.importe, cb.banco
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${id}::uuid AND cb.cuenta_id = ${session.id}::uuid
    LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const m = rows[0]
  const concepto = (m.concepto_normalizado || m.concepto || m.contraparte || '').slice(0, 160)
  const importe = Math.abs(Number(m.importe)).toFixed(2)

  try {
    const raw = await aiComplete([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Cargo de ${importe}€ (banco ${m.banco ?? '?'}): ${concepto}` },
    ])
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean) as { bucket?: string; amortizable?: boolean; motivo?: string }
    const valid: GastoBucket[] = ['negocio', 'renta', 'no_deducible']
    const bucket = (valid.includes(parsed.bucket as GastoBucket) ? parsed.bucket : 'no_deducible') as GastoBucket
    return NextResponse.json({ bucket, amortizable: !!parsed.amortizable, motivo: (parsed.motivo || '').slice(0, 120) })
  } catch (e) {
    console.error('[gastos/sugerir] IA falló ·', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'La IA no pudo sugerir ahora mismo.' }, { status: 502 })
  }
}
