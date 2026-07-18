import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'
import type { GastoBucket } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

// POST /api/finanzas/gastos/sugerir-lote { ids } — la IA propone bucket + amortizable para VARIOS
// cargos en UNA sola llamada (para la bandeja agrupada). SOLO sugiere; aplica el dueño.
const SYSTEM = `Eres el contable de Alberto (persona física, España). Para CADA cargo bancario di su
bucket de deducibilidad y si es un bien AMORTIZABLE:
- "negocio": gasto de su actividad económica (correduría de seguros; cuota de autónomos/TGSS,
  gasolina/combustible para visitar clientes, hosting, software, material de oficina…).
- "renta": gasto de sus pisos turísticos en alquiler (suministros —luz/agua/internet—, reparaciones,
  mobiliario, plataformas tipo Booking/Airbnb/Smoobu/PriceLabs, comunidad de propietarios, IBI,
  seguro del piso, Netflix de los pisos…).
- "no_deducible": gasto personal/familiar (supermercado, ocio, ropa, restaurantes sin relación clara,
  Bizums personales, golf, guardería/escuela infantil de los hijos…).
REGLAS FIJAS (por ENCIMA del criterio de abajo): "MONTE CARMELO 68"/"MONTECARMELO" es la VIVIENDA
HABITUAL → su comunidad/IBI/suministros son SIEMPRE "no_deducible", NUNCA "renta". Guardería/escuela
infantil (p.ej. "WORKANDLIFE", escuelas de la Junta) → SIEMPRE "no_deducible", NUNCA "negocio"/"formación".
La "comunidad de propietarios" solo es "renta" si es de un piso turístico en alquiler.
CRITERIO DE ALBERTO (importante): solo es "no_deducible" lo CLARAMENTE personal/familiar. Todo lo demás
es DEDUCIBLE → "negocio" (correduría) o "renta" (pisos). Ante la duda razonable entre negocio y renta,
elige el que encaje mejor, pero NO marques "no_deducible" "por si acaso".
"amortizable": true SOLO si es MOBILIARIO/ELECTRODOMÉSTICO/EQUIPO/OBRA (bien duradero, normalmente caro).
Responde SOLO un array JSON, un objeto por cargo EN EL MISMO ORDEN:
[{"i":0,"bucket":"negocio|renta|no_deducible","amortizable":true|false,"motivo":"breve, máx 80 chars"}].`

const MAX = 40

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { ids } = await req.json().catch(() => ({})) as { ids?: string[] }
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'ids requerido' }, { status: 400 })
  const lista = ids.slice(0, MAX)

  const rows = await prisma.$queryRaw<Array<{ id: string; concepto: string | null; concepto_normalizado: string | null; contraparte: string | null; importe: unknown; banco: string | null }>>`
    SELECT mb.id, mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.importe, cb.banco
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ANY(${lista}::uuid[])
      AND cb.cuenta_id = ${session.id}::uuid
  `
  // Mantener el orden recibido (la IA responde por índice) y solo los que existen.
  const ordenadas = lista.map(id => rows.find(r => r.id === id)).filter(Boolean) as typeof rows
  if (ordenadas.length === 0) return NextResponse.json({})

  const prompt = ordenadas.map((m, i) => {
    const c = (m.concepto_normalizado || m.concepto || m.contraparte || '').slice(0, 140)
    return `${i}. [${Math.abs(Number(m.importe)).toFixed(2)}€ · ${m.banco ?? '?'}] ${c}`
  }).join('\n')

  try {
    const raw = await aiComplete([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ])
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean) as Array<{ i: number; bucket?: string; amortizable?: boolean; motivo?: string }>
    const valid: GastoBucket[] = ['negocio', 'renta', 'no_deducible']
    const out: Record<string, { bucket: GastoBucket; amortizable: boolean; motivo: string }> = {}
    for (const p of Array.isArray(parsed) ? parsed : []) {
      const mov = ordenadas[p.i]
      if (!mov) continue
      const bucket = (valid.includes(p.bucket as GastoBucket) ? p.bucket : 'no_deducible') as GastoBucket
      out[mov.id] = { bucket, amortizable: !!p.amortizable, motivo: (p.motivo || '').slice(0, 100) }
    }
    return NextResponse.json(out)
  } catch (e) {
    console.error('[gastos/sugerir-lote] IA falló ·', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'La IA no pudo sugerir ahora mismo.' }, { status: 502 })
  }
}
