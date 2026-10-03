import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { duplicadosVivos } from '@/lib/cartera-duplicados'

export const dynamic = 'force-dynamic'

// GET /api/operador/duplicados/vivos — vigía: números de póliza duplicados entre filas VIVAS
// (sin fusionar, sin comodines). Read-only, sin datos personales. Mismos cuatro estados que el resto
// del puerto; `{ total, muestra }` con 50 como máximo. (`/api/operador/duplicados`, a secas, es la
// lista de grupos de la pantalla de Duplicadas: no se toca.)
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ estado: 'error' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const d = await duplicadosVivos(correduria.id)
    if (d === null) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', total: d.total, muestra: d.muestra })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/duplicados/vivos', e) })
  }
}
