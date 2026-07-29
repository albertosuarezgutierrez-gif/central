import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getResumenFinanciero } from '@/lib/finanzas'
import { cazarDeducciones } from '@/lib/cazador-deducciones'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/banca/cazador-deducciones { year, quarter, desde, hasta } — el 🧾 Cazador de deducciones
// de /banca. Estima el tramo marginal IRPF del año (fiscal es anual) y pide al cazador que marque, de
// los gastos personales del periodo, cuáles parecen deducibles + el ahorro. Solo SUGIERE. Degrada sin
// romper (si la IA/BD falla devuelve una caza vacía con nota).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { year, quarter, desde, hasta } = await req.json().catch(() => ({})) as {
    year?: number; quarter?: number; desde?: string; hasta?: string
  }
  const now = new Date()
  const anio = Number(year) || (desde ? Number(desde.slice(0, 4)) : now.getFullYear())
  const q = Number(quarter) || 0

  try {
    // Tramo marginal = del AÑO completo (la declaración es anual), no del intervalo.
    const resumen = await getResumenFinanciero(session.id, anio, 0)
    const tramoMarginal = resumen.fiscal.tramoActual.tipo || 0.3
    const caza = await cazarDeducciones(session.id, anio, q, desde || undefined, hasta || undefined, tramoMarginal)
    return NextResponse.json(caza)
  } catch (e) {
    console.error('[cazador-deducciones]', e)
    return NextResponse.json({
      candidatos: [], totalDeducible: 0, ahorroEstimado: 0, tramoMarginal: 0, analizados: 0, revisadosTotal: 0,
      nota: 'No se pudo completar la búsqueda ahora mismo. Inténtalo de nuevo en un momento.',
    })
  }
}
