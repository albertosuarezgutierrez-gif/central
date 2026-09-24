import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { calidadCartera } from '@/lib/calidad-cartera'

export const dynamic = 'force-dynamic'

// GET /api/operador/calidad — huecos del dato en la cartera en vigor (vencidas sin renovación,
// pólizas sin prima, fichas con el mismo DNI, clientes sin DNI o sin fecha de nacimiento).
// Solo lectura. Un fallo es `estado:'error'`, nunca una lista vacía: vacía diría «todo en orden».
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', incidencias: await calidadCartera(correduria.id) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/calidad', e) })
  }
}
