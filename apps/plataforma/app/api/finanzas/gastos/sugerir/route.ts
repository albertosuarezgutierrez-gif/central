import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'
import type { GastoBucket } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

// POST /api/finanzas/gastos/sugerir { id } — la IA propone bucket + amortizable + motivo para un
// cargo. SOLO sugiere; la escritura la confirma el dueño con un toque (destino + amortizable).
// Cuando el bucket es "no_deducible", también detecta deducciones especiales de cuota:
//   - mecenazgo: donaciones a fundaciones/ONG (Ley 49/2002, 80%/40% sobre lo donado)
//   - guarderia: pagos a guarderías/custodia hijos < 3 años (Art.81bis LIRPF, hasta €1.000 extra)
//   - deportiva_and: cuotas de gimnasio/actividad deportiva en Andalucía (D.A.1ª Ley 7/2021, 15% base máx. €100)
const SYSTEM = `Eres el contable de Alberto (persona física, España). Clasificas un cargo bancario.
Determina el BUCKET de deducibilidad, si es AMORTIZABLE, y si aun siendo no_deducible tiene
una DEDUCCIÓN ESPECIAL DE CUOTA (no de base imponible, sino directamente de cuota).

Buckets:
- "negocio": gasto de su actividad económica (correduría de seguros; cuota de autónomos/TGSS,
  gasolina/combustible para visitar clientes, hosting, software, material de oficina…).
- "renta": gasto de sus pisos turísticos EN ALQUILER (suministros —luz/agua/internet—, reparaciones,
  mobiliario, plataformas tipo Booking/Airbnb/Smoobu, comunidad de propietarios, IBI, seguro del piso…).
  OJO: comunidad/IBI/suministros/derramas son "renta" SOLO si son de un PISO TURÍSTICO en alquiler.
- "no_deducible": gasto personal/familiar.

REGLAS FIJAS (no falles en estas, van por ENCIMA del criterio de abajo):
- "MONTE CARMELO 68" / "MONTECARMELO" es la VIVIENDA HABITUAL de Alberto: su comunidad, IBI, suministros
  y derramas son SIEMPRE "no_deducible" (personal), NUNCA "renta"/pisos.
- Guardería, escuela infantil o custodia de menores (p.ej. "WORKANDLIFE", escuelas de la Junta de
  Andalucía) → SIEMPRE "no_deducible" + deduccionCuotaTipo="guarderia". NUNCA "negocio" ni "formación".

CRITERIO: solo es "no_deducible" lo CLARAMENTE personal. Ante la duda razonable, elige negocio o renta.

Amortizable: true SOLO para mobiliario, electrodomésticos, equipos o reformas (bien duradero).

Deducción de cuota (solo cuando bucket="no_deducible"):
- "mecenazgo": pago a una FUNDACIÓN, ONG, entidad sin ánimo de lucro acogida a Ley 49/2002.
- "guarderia": pago a escuela infantil, guardería, centro de custodia de menor < 3 años.
- "deportiva_and": cuota de gimnasio, club deportivo, actividad deportiva (Andalucía).
- null: gasto personal sin deducción especial.

Responde SOLO JSON sin markdown:
{"bucket":"negocio|renta|no_deducible","amortizable":true|false,"motivo":"breve, máx 90 chars","deduccionCuotaTipo":"mecenazgo|guarderia|deportiva_and|null"}`

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
    const parsed = JSON.parse(clean) as { bucket?: string; amortizable?: boolean; motivo?: string; deduccionCuotaTipo?: string | null }
    const valid: GastoBucket[] = ['negocio', 'renta', 'no_deducible']
    const bucket = (valid.includes(parsed.bucket as GastoBucket) ? parsed.bucket : 'no_deducible') as GastoBucket
    const validCuota = ['mecenazgo', 'guarderia', 'deportiva_and']
    const deduccionCuotaTipo = bucket === 'no_deducible' && parsed.deduccionCuotaTipo && validCuota.includes(parsed.deduccionCuotaTipo)
      ? parsed.deduccionCuotaTipo
      : null
    return NextResponse.json({ bucket, amortizable: !!parsed.amortizable, motivo: (parsed.motivo || '').slice(0, 120), deduccionCuotaTipo })
  } catch (e) {
    console.error('[gastos/sugerir] IA falló ·', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'La IA no pudo sugerir ahora mismo.' }, { status: 502 })
  }
}
